import {upsertThumbnailVisualHash} from '../visualHashBackfill'
import fs from 'fs/promises'
import path from 'path'
import {randomUUID} from 'crypto'
import type {ApiDb} from '../../types/db'
import {pinSourceDb, openSource, sourceError} from '../mediaSources/context'
import {resolveMediaLocation, nasVersionMatches} from '../mediaSources/locations'
import {createNasMediaInput} from './mediaInput'
import {createNasThumbnail, probeNasMedia} from './mediaProbe'
import {createVideoMetadataRepository} from '../../db/repositories/videoMetadata'
import {nasThumbnailVersion} from './mediaAssetsState'

/** Regenerate a poster through bounded, authenticated range reads. */
export async function createNasVideoThumbnail(db: ApiDb, id: number, source: string, seekRatio: number) {
  const pinned = pinSourceDb(db), current = pinned.db
  const resolved = resolveMediaLocation(current, id)
  if (!current.path || resolved.provider !== 'nas' || resolved.card.path !== source) throw sourceError('source_changed')
  const assertCurrent = () => {
    pinned.assertCurrent()
    const latest = resolveMediaLocation(current, id)
    if (latest.provider !== 'nas' || latest.card.path !== source || latest.location.id !== resolved.location.id
      || latest.location.version !== resolved.location.version || latest.location.resourceKey !== resolved.location.resourceKey
      || latest.connection.config !== resolved.connection.config || latest.connection.credentialRef !== resolved.connection.credentialRef) throw sourceError('source_changed')
  }
  const signal = AbortSignal.timeout(100_000)
  const retryNetwork = async <T>(action: () => Promise<T>): Promise<T> => {
    try { return await action() } catch (error) {
      signal.throwIfAborted(); assertCurrent()
      if ((error as {code?: string})?.code !== 'network_error') throw error
      return action()
    }
  }
  const open = (active: AbortSignal) => retryNetwork(() => openSource(current, resolved.connection.id, active))
  const stat = () => retryNetwork(async () => {
    const adapter = await openSource(current, resolved.connection.id, signal)
    try {
      const file = await adapter.stat(resolved.location.resourceKey, signal)
      assertCurrent(); signal.throwIfAborted()
      if (file.isDirectory || !file.contentType.startsWith('video/') || !Number.isSafeInteger(file.size) || file.size <= 0
        || !nasVersionMatches(resolved.location.version, file.version)) throw sourceError('source_changed')
      return file
    } finally { adapter.close() }
  })
  const file = await stat()
  const destination = path.join(current.path, 'media/videos/thumbs', `${id}.jpg`)
  const temporary = `${destination}.${randomUUID()}.tmp.jpg`
  const input = await createNasMediaInput({file, open, assertCurrent, signal, maxBytes: 96 * 1024 * 1024})
  try {
    const knownDuration = Number(createVideoMetadataRepository(current.drizzle).findByMediaId(id)?.duration)
    const duration = Number.isFinite(knownDuration) && knownDuration > 0
      ? knownDuration : (await probeNasMedia(input.url, signal)).metadata.duration
    input.assertHealthy()
    await fs.mkdir(path.dirname(destination), {recursive: true})
    await createNasThumbnail(input.url, temporary, 'video', duration, undefined, signal, seekRatio)
    input.assertHealthy()
    if (!nasThumbnailVersion(temporary)) throw sourceError('invalid_thumbnail')
    const encoded = await fs.stat(temporary)
    if (encoded.size < 512) await fs.appendFile(temporary, Buffer.alloc(512 - encoded.size))
    const after = await stat()
    if (after.version !== file.version || after.size !== file.size) throw sourceError('source_changed')
    assertCurrent(); signal.throwIfAborted()
    await fs.rename(temporary, destination)
    await upsertThumbnailVisualHash(current, id).catch(() => {})
    return 'success'
  } finally { input.close(); await fs.rm(temporary, {force: true}) }
}
