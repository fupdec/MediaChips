import {upsertThumbnailVisualHash} from '../visualHashBackfill'
import {runLibraryBackgroundTask} from '../libraryMaintenance'
import fs from 'fs/promises'
import path from 'path'
import {constants, unlinkSync} from 'fs'
import {randomUUID} from 'crypto'
import type {ApiDb} from '../../types/db'
import {isNasMediaPath} from '../../../shared/remoteMedia'
import {createMediaTypesRepository} from '../../db/repositories/mediaTypes'
import {pinSourceDb, openSource, sourceError} from '../mediaSources/context'
import {resolveMediaLocation, nasVersionMatches} from '../mediaSources/locations'
import {sourceOperation} from '../mediaSources/cancellation'
import {createConcurrencyQueue} from '../concurrencyQueue'
import {fillCloudMediaMetadata, readCloudMediaMetadata} from '../cloudAccounts/libraryMetadata'
import {invalidateMediaDerivedCaches} from '../mediaCacheInvalidation'
import {createNasMediaInput} from './mediaInput'
import {probeNasMedia, createNasThumbnail} from './mediaProbe'
import {nasAssetsStatePath, nasThumbnailPath, nasThumbnailVersion, readNasAssetsState, type NasAssetsState} from './mediaAssetsState'

const RETRY_MS = 15 * 60_000, SUCCESS_RETRY_MS = 24 * 60 * 60_000
export const NAS_PROBE_MAX_BYTES = 32 * 1024 * 1024
export const NAS_THUMB_MAX_BYTES = 64 * 1024 * 1024
const queue = createConcurrencyQueue(1, {maxPending: 32})

export function createNasMediaAssetsService(db: ApiDb, options: {
  open?: typeof openSource; probe?: typeof probeNasMedia; thumbnail?: typeof createNasThumbnail; now?: () => number
  maxProbeBytes?: number; maxThumbBytes?: number
} = {}) {
  const now = options.now || Date.now
  const pending = new Map<string, Promise<boolean>>()
  const failed = new Map<string, number>()
  const controller = new AbortController()
  const cursors = new WeakMap<object, {id: number; nextScan: number}>()
  let ticking = false
  const ensure = async (id: number): Promise<boolean> => {
    controller.signal.throwIfAborted()
    const pinned = pinSourceDb(db), current = pinned.db
    const resolved = resolveMediaLocation(current, id)
    if (resolved.provider !== 'nas' || !isNasMediaPath(resolved.card.path) || !current.path) return false
    const kind = createMediaTypesRepository(current.drizzle).findById(resolved.card.mediaTypeId!)?.type || ''
    if (!['video', 'audio', 'image'].includes(kind)) return false
    const source = resolved.card.path, key = `${current.path}:${id}:${source}:${resolved.location.version}`
    const existing = pending.get(key)
    if (existing) return existing
    if ((failed.get(key) || 0) > now()) return false
    const state = readNasAssetsState(current.path, id, source, resolved.location.version)
    const destination = nasThumbnailPath(current.path, kind, id)
    const cachedThumbnail = nasThumbnailVersion(destination)
    if (state && state.retryAt > now() && (state.thumbnail !== 'ready' || cachedThumbnail)) return false
    const known = readCloudMediaMetadata(current, id)!
    const metadataComplete = kind === 'image' ? known.width > 0 && known.height > 0
      : known.duration > 0 && known.bitrate > 0 && !!known.codec && (kind !== 'video' || (known.width > 0 && known.height > 0 && known.fps > 0))
    if (metadataComplete && known.filesize > 0 && cachedThumbnail) return false
    const assertCurrent = () => {
      pinned.assertCurrent(); controller.signal.throwIfAborted()
      const latest = resolveMediaLocation(current, id)
      if (latest.provider !== 'nas' || latest.card.path !== source || latest.location.id !== resolved.location.id
        || latest.location.resourceKey !== resolved.location.resourceKey || latest.location.version !== resolved.location.version
        || latest.connection.config !== resolved.connection.config || latest.connection.credentialRef !== resolved.connection.credentialRef) throw sourceError('source_changed')
    }
    const promise = queue.enqueue(async () => {
      assertCurrent()
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(100_000)])
      const open = (active: AbortSignal) => (options.open || openSource)(current, resolved.connection.id, active)
      const stat = async () => {
        const adapter = await sourceOperation(() => open(signal), signal)
        try {
          const file = await sourceOperation(() => adapter.stat(resolved.location.resourceKey, signal), signal)
          assertCurrent(); signal.throwIfAborted()
          if (file.isDirectory || file.resourceKey !== resolved.location.resourceKey || !Number.isSafeInteger(file.size) || file.size <= 0
            || !file.contentType.startsWith(`${kind}/`) || !nasVersionMatches(resolved.location.version, file.version)) throw sourceError('source_changed')
          return file
        } finally { adapter.close() }
      }
      const file = await stat()
      const input = await createNasMediaInput({file, open, assertCurrent, signal, maxBytes: options.maxProbeBytes ?? NAS_PROBE_MAX_BYTES})
      let probe: Awaited<ReturnType<typeof probeNasMedia>>
      try { probe = await (options.probe || probeNasMedia)(input.url, signal); input.assertHealthy() }
      finally { input.close() }
      const afterProbe = await stat()
      if (afterProbe.version !== file.version || afterProbe.size !== file.size) throw sourceError('source_changed')
      let changed = current.drizzle.transaction(tx => fillCloudMediaMetadata({drizzle: tx}, id, kind, {...file, mediaMetadata: probe.metadata}))
      if (changed) invalidateMediaDerivedCaches()
      let thumbnail: NasAssetsState['thumbnail'] = nasThumbnailVersion(destination) ? 'ready' : 'pending'
      if (thumbnail !== 'ready' && kind === 'audio' && probe.coverIndex == null) thumbnail = 'unavailable'
      if (thumbnail === 'pending') {
        await fs.mkdir(path.dirname(destination), {recursive: true})
        if (!nasThumbnailVersion(destination)) {
          try { unlinkSync(destination) } catch (err) { if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err }
        }
        const temporary = `${destination}.${randomUUID()}.tmp.jpg`
        const thumbInput = await createNasMediaInput({file, open, assertCurrent, signal, maxBytes: options.maxThumbBytes ?? NAS_THUMB_MAX_BYTES})
        try {
          await (options.thumbnail || createNasThumbnail)(thumbInput.url, temporary, kind, probe.metadata.duration, probe.coverIndex, signal)
          thumbInput.assertHealthy()
          if (!nasThumbnailVersion(temporary)) throw sourceError('invalid_thumbnail')
          // Match the video thumb cache's size floor even for a tiny solid frame.
          const encoded = await fs.stat(temporary)
          if (encoded.size < 512) await fs.appendFile(temporary, Buffer.alloc(512 - encoded.size))
          const after = await stat()
          if (after.version !== file.version || after.size !== file.size) throw sourceError('source_changed')
          assertCurrent(); signal.throwIfAborted()
          try { await fs.copyFile(temporary, destination, constants.COPYFILE_EXCL); changed = true }
          catch (err) { if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err }
          if (!nasThumbnailVersion(destination)) throw sourceError('invalid_thumbnail')
          thumbnail = 'ready'
          if (kind === 'video') await upsertThumbnailVisualHash(current, id).catch(() => {})
        } catch (err) {
          assertCurrent(); signal.throwIfAborted()
          if ((err as {code?: string})?.code === 'source_changed') throw err
          // Useful metadata remains committed even if a cover needs another attempt.
        } finally { thumbInput.close(); await fs.rm(temporary, {force: true}) }
      }
      const marker = nasAssetsStatePath(current.path!, id), temporary = `${marker}.${randomUUID()}.tmp`
      try {
        await fs.mkdir(path.dirname(marker), {recursive: true})
        await fs.writeFile(temporary, JSON.stringify({source, version: resolved.location.version, thumbnail, retryAt: now() + (thumbnail === 'pending' ? RETRY_MS : SUCCESS_RETRY_MS)} satisfies NasAssetsState), {flag: 'wx'})
        assertCurrent(); await fs.rename(temporary, marker)
      } finally { await fs.rm(temporary, {force: true}) }
      return changed
    }, {signal: controller.signal}).catch(err => {
      if (failed.size >= 5000) failed.delete(failed.keys().next().value!)
      failed.set(key, now() + RETRY_MS)
      throw err
    }).finally(() => pending.delete(key))
    pending.set(key, promise)
    return promise
  }
  return {
    ensure,
    tick() {
      return runLibraryBackgroundTask(async () => {
        if (ticking || controller.signal.aborted) return
        ticking = true
        try {
          const pinned = pinSourceDb(db), current = pinned.db
          let cursor = cursors.get(current.sqlite)
          if (!cursor) { cursor = {id: 0, nextScan: 0}; cursors.set(current.sqlite, cursor) }
          if (cursor.nextScan && cursor.nextScan <= now()) { cursor.id = 0; cursor.nextScan = 0 }
          const rows = current.sqlite.prepare(`SELECT m.id FROM media m JOIN mediaTypes t ON t.id = m.mediaTypeId
            WHERE m.id > ? AND m.path LIKE 'nas://%' AND (m.deletedAt IS NULL OR m.deletedAt = '')
            AND t.type IN ('video','image','audio') ORDER BY m.id LIMIT 32`).all(cursor.id) as {id: number}[]
          for (const row of rows) {
            pinned.assertCurrent(); if (controller.signal.aborted) return
            try { await ensure(row.id) } catch { /* Disconnected sources retry later without interrupting the library. */ }
          }
          pinned.assertCurrent()
          if (rows.length) cursor.id = rows[rows.length - 1].id
          if (rows.length < 32 && !cursor.nextScan) cursor.nextScan = now() + RETRY_MS
        } finally { ticking = false }
      })
    },
    dispose() { controller.abort() },
  }
}
const services = new WeakMap<ApiDb, ReturnType<typeof createNasMediaAssetsService>>()
export function getNasMediaAssets(db: ApiDb) {
  let service = services.get(db)
  if (!service) { service = createNasMediaAssetsService(db); services.set(db, service) }
  return service
}
