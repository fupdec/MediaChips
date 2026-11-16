import {runLibraryBackgroundTask} from '../libraryMaintenance'
import {isNasMediaPath} from '../../../shared/remoteMedia'
import type {ApiDb} from '../../types/db'
import {isCloudMediaPath} from '../../../shared/cloudAccounts'
import {isDriveMediaPath} from '../../../shared/cloudDrive'
import {createMediaTypesRepository} from '../../db/repositories/mediaTypes'
import {pinSourceDb, openSource, sourceError} from '../mediaSources/context'
import {resolveMediaLocation} from '../mediaSources/locations'
import {sourceOperation} from '../mediaSources/cancellation'
import {createConcurrencyQueue} from '../concurrencyQueue'
import {invalidateMediaDerivedCaches} from '../mediaCacheInvalidation'
import {fillCloudMediaMetadata} from './libraryMetadata'

export const isCloudMetadataPath = (path: unknown) => isCloudMediaPath(path) || isDriveMediaPath(path) || isNasMediaPath(path)
export const CLOUD_METADATA_RETRY_MS = 15 * 60_000
const queue = createConcurrencyQueue(2, {maxPending: 128})
const libraries = new WeakMap<object, {pending: Map<string, Promise<boolean>>; attempted: Map<string, number>}>()

/** Metadata API calls only. This never streams or downloads the original. */
export async function refreshCloudMediaMetadata(db: ApiDb, mediaId: number, options: {
  signal?: AbortSignal; open?: typeof openSource; now?: () => number
} = {}): Promise<boolean> {
  const pinned = pinSourceDb(db), current = pinned.db
  const nasCard = current.sqlite.prepare('SELECT path FROM media WHERE id = ?').get(mediaId) as {path: string} | undefined
  if (isNasMediaPath(nasCard?.path)) {
    const {getNasMediaAssets} = await import('../nas/mediaAssets')
    return getNasMediaAssets(db).ensure(mediaId)
  }
  const resolved = resolveMediaLocation(current, mediaId)
  if (!isCloudMetadataPath(resolved.card.path) || resolved.provider === 'local' || resolved.provider === 'nas') return false
  let state = libraries.get(current.sqlite)
  if (!state) { state = {pending: new Map(), attempted: new Map()}; libraries.set(current.sqlite, state) }
  const identity = JSON.stringify([current.path, mediaId, resolved.card.path, resolved.location.id, resolved.location.resourceKey, resolved.location.version])
  const now = options.now || Date.now
  options.signal?.throwIfAborted()
  const assertCurrent = () => {
    pinned.assertCurrent()
    options.signal?.throwIfAborted()
    const latest = resolveMediaLocation(current, mediaId)
    if (latest.provider === 'local' || latest.card.path !== resolved.card.path || latest.location.id !== resolved.location.id
      || latest.location.resourceKey !== resolved.location.resourceKey || latest.location.version !== resolved.location.version
      || latest.connection.config !== resolved.connection.config || latest.connection.credentialRef !== resolved.connection.credentialRef) throw sourceError('source_changed')
  }
  const previous = state.pending.get(identity)
  if (previous) { const changed = await previous; assertCurrent(); return changed }
  if ((state.attempted.get(identity) ?? -Infinity) + CLOUD_METADATA_RETRY_MS > now()) return false
  const promise = queue.enqueue(async () => {
    assertCurrent()
    const signal = AbortSignal.any([options.signal || new AbortController().signal, AbortSignal.timeout(30_000)])
    const adapter = await sourceOperation(() => (options.open || openSource)(current, resolved.connection.id, signal), signal)
    try {
      const file = await sourceOperation(() => adapter.stat(resolved.location.resourceKey, signal), signal)
      signal.throwIfAborted(); assertCurrent()
      if (file.isDirectory || file.resourceKey !== resolved.location.resourceKey || (resolved.location.version && file.version !== resolved.location.version)) throw sourceError('source_changed')
      const kind = createMediaTypesRepository(current.drizzle).findById(resolved.card.mediaTypeId!)?.type || ''
      if (!file.contentType.startsWith(`${kind}/`)) throw sourceError('unsupported_media')
      const changed = current.drizzle.transaction(tx => fillCloudMediaMetadata({drizzle: tx}, mediaId, kind, file))
      if (changed) invalidateMediaDerivedCaches()
      return changed
    } finally { adapter.close() }
  }, {signal: options.signal}).finally(() => {
    state!.pending.delete(identity)
    if (state!.attempted.size >= 5000) state!.attempted.delete(state!.attempted.keys().next().value!)
    state!.attempted.set(identity, now())
  })
  state.pending.set(identity, promise)
  return promise
}

// Request only fields the provider supports. Missing optional fields must not keep
// Google Drive / Dropbox files in an endless codec/bitrate backfill loop.
const pendingSql = `
  SELECT m.id FROM media m JOIN mediaTypes t ON t.id = m.mediaTypeId
  LEFT JOIN videoMetadata v ON v.mediaId = m.id LEFT JOIN imageMetadata i ON i.mediaId = m.id
  WHERE m.id > ? AND (m.deletedAt IS NULL OR m.deletedAt = '')
    AND (m.path LIKE 'gdrive://%' OR m.path LIKE 'onedrive://%' OR m.path LIKE 'dropbox://%')
    AND t.type IN ('video','audio','image') AND (
      COALESCE(m.filesize,0) <= 0
      OR (t.type = 'image' AND (COALESCE(i.width,0) <= 0 OR COALESCE(i.height,0) <= 0))
      OR (t.type = 'video' AND (COALESCE(v.duration,0) <= 0 OR COALESCE(v.width,0) <= 0 OR COALESCE(v.height,0) <= 0))
      OR (m.path LIKE 'onedrive://%' AND t.type IN ('video','audio') AND (
        COALESCE(v.duration,0) <= 0 OR COALESCE(v.bitrate,0) <= 0
        OR (t.type = 'video' AND (COALESCE(v.fps,0) <= 0 OR COALESCE(TRIM(v.codec),'') = '')))))
  ORDER BY m.id LIMIT ?`

export function createCloudMetadataBackfill(db: ApiDb, options: {
  open?: typeof openSource; now?: () => number; batchSize?: number
} = {}) {
  const now = options.now || Date.now
  const states = new WeakMap<object, {cursor: number; nextScan: number}>()
  let running = false, disposed = false
  const controller = new AbortController()
  return {
    tick() {
      return runLibraryBackgroundTask(async () => {
        if (running || disposed) return
        running = true
        try {
          const pinned = pinSourceDb(db), current = pinned.db
          let state = states.get(current.sqlite)
          if (!state) { state = {cursor: 0, nextScan: 0}; states.set(current.sqlite, state) }
          if (state.nextScan > now()) return
          const batchSize = Math.max(1, Math.min(32, options.batchSize || 16))
          const rows = current.sqlite.prepare(pendingSql).all(state.cursor, batchSize) as {id: number}[]
          for (let offset = 0; offset < rows.length; offset += 2) {
            pinned.assertCurrent(); if (disposed) return
            await Promise.all(rows.slice(offset, offset + 2).map(async row => {
              try { await refreshCloudMediaMetadata(db, row.id, {signal: controller.signal, open: options.open, now}) }
              catch { /* Offline / pending provider metadata is retried on the next pass. */ }
            }))
            pinned.assertCurrent(); if (disposed) return
          }
          if (rows.length < batchSize) { state.cursor = 0; state.nextScan = now() + CLOUD_METADATA_RETRY_MS }
          else state.cursor = rows[rows.length - 1].id
        } finally { running = false }
      })
    },
    dispose() { disposed = true; controller.abort() },
  }
}
