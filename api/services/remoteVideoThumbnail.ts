import {upsertThumbnailVisualHash} from './visualHashBackfill'
import {isNasMediaPath} from '../../shared/remoteMedia'
import fs from 'fs/promises'
import {constants} from 'fs'
import path from 'path'
import {randomUUID} from 'crypto'
import type {ApiDb} from '../types/db'
import {createMediaRepository} from '../db/repositories/media'
import {isWebVideoPath} from '../../shared/webVideo'
import {parseDriveMediaPath} from '../../shared/cloudDrive'
import {parseCloudMediaPath} from '../../shared/cloudAccounts'
import {getCloudDriveService} from './cloudDrive'
import {getCloudAccounts} from './cloudAccounts/accounts'
import {pinSourceDb} from './mediaSources/context'
import {createConcurrencyQueue} from './concurrencyQueue'
import {runLibraryBackgroundTask} from './libraryMaintenance'

const queue = createConcurrencyQueue(3, {maxPending: 32})
const libraries = new WeakMap<object, {pending: Map<string, Promise<string | null>>; failed: Map<string, number>}>()

/** Cache provider covers on first card request. Missing covers never trigger original downloads. */
export async function ensureRemoteVideoThumbnail(db: ApiDb, mediaId: number): Promise<string | null> {
  const pinned = pinSourceDb(db)
  const media = createMediaRepository(pinned.db.drizzle).findById(mediaId)
  if (!pinned.db.path || !media?.path || media.deletedAt) return Promise.resolve(null)
  const source = media.path
  if (isNasMediaPath(source)) {
    const {getNasMediaAssets} = await import('./nas/mediaAssets')
    const {nasThumbnailPath, nasThumbnailVersion} = await import('./nas/mediaAssetsState')
    pinned.assertCurrent()
    const file = nasThumbnailPath(pinned.db.path!, 'video', mediaId)
    if (nasThumbnailVersion(file)) return file
    // A slow NAS probe must not hold image HTTP connections open. The metadata
    // snapshot poll refreshes the card once the background worker has a cover.
    void runLibraryBackgroundTask(() => getNasMediaAssets(db).ensure(mediaId)).catch(() => {
      /* Offline NAS is retried by the background worker. */
    })
    return null
  }
  const drive = parseDriveMediaPath(source), cloud = parseCloudMediaPath(source)
  if (!isWebVideoPath(source) && !drive && !cloud) return Promise.resolve(null)
  let state = libraries.get(pinned.db.sqlite)
  if (!state) { state = {pending: new Map(), failed: new Map()}; libraries.set(pinned.db.sqlite, state) }
  const key = `${pinned.db.path}:${mediaId}:${source}`
  if ((state.failed.get(key) || 0) > Date.now()) return Promise.resolve(null)
  const existing = state.pending.get(key)
  if (existing) return existing
  const destination = path.join(pinned.db.path, 'media/videos/thumbs', `${mediaId}.jpg`)
  const assertCurrent = () => {
    pinned.assertCurrent()
    const current = createMediaRepository(pinned.db.drizzle).findById(mediaId)
    if (!current || current.deletedAt || current.path !== source) throw new Error('Video source changed.')
  }
  const pending = queue.enqueue(async () => {
    assertCurrent()
    const signal = AbortSignal.timeout(45_000)
    let bytes: Buffer | null
    if (isWebVideoPath(source)) {
      const {resolveWebVideoThumbnail} = await import('./webVideo/service')
      bytes = await resolveWebVideoThumbnail(pinned.db, mediaId, signal)
    } else if (drive) {
      bytes = await getCloudDriveService().transport.thumbnail?.(drive, signal) || null
    } else {
      const adapter = getCloudAccounts().adapter(pinned.db, cloud!.connectionId)
      try { bytes = await adapter.thumbnail?.(cloud!.resourceKey, signal) || null }
      finally { adapter.close() }
    }
    if (!bytes) return null
    const {default: sharp} = await import('sharp')
    const jpeg = await sharp(bytes, {limitInputPixels: 16_777_216})
      .rotate().resize({width: 640, height: 640, fit: 'inside', withoutEnlargement: true})
      .jpeg({quality: 85}).toBuffer()
    assertCurrent()
    await fs.mkdir(path.dirname(destination), {recursive: true})
    const temporary = `${destination}.${randomUUID()}.tmp`
    try {
      await fs.writeFile(temporary, jpeg, {flag: 'wx'})
      signal.throwIfAborted()
      assertCurrent()
      // Preserve a custom poster saved while the remote image was loading.
      try { await fs.copyFile(temporary, destination, constants.COPYFILE_EXCL) }
      catch (err) { if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err }
      await upsertThumbnailVisualHash(pinned.db, mediaId).catch(() => {})
      return destination
    } finally { await fs.rm(temporary, {force: true}) }
  }).catch(() => null).then(result => {
    if (!result) {
      if (state!.failed.size >= 500) state!.failed.delete(state!.failed.keys().next().value!)
      state!.failed.set(key, Date.now() + 5 * 60_000)
    }
    return result
  }).finally(() => state!.pending.delete(key))
  state.pending.set(key, pending)
  return pending
}
