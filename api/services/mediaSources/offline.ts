import fs from 'fs'
import path from 'path'
import os from 'os'
import {createHash, randomUUID} from 'crypto'
import {Readable, Transform} from 'stream'
import {pipeline} from 'stream/promises'
import {eq} from 'drizzle-orm'
import type {Response} from 'express'
import type {ApiDb} from '../../types/db'
import {offlineCopies, sourceCacheSettings} from '../../db/schema/mediaSources'
import type {OfflineStatus} from '../../../shared/sourceCatalog'
import {resolveMediaLocation, nasVersionMatches} from './locations'
import type {SourceReadAdapter} from './adapter'
import {sourceError} from './context'

export const DEFAULT_OFFLINE_LIMIT = 5 * 1024 ** 3
export function offlineDirectory(db: ApiDb, base = path.join(process.env.MEDIA_CHIPS_DATA_DIR || process.app_folder || path.join(os.homedir(), '.mediachips'), 'offline-media')) {
  return path.resolve(base, createHash('sha256').update(path.resolve(db.sqlite.name || db.path || '')).digest('hex'))
}
const cachePath = (directory: string, fileName: string) => {
  if (!/^[a-f0-9-]{36}\.media$/.test(fileName)) throw sourceError('invalid_offline_copy')
  return path.join(directory, fileName)
}
export function offlineUsage(directory: string): number {
  if (!fs.existsSync(directory)) return 0
  return fs.readdirSync(directory).reduce((sum, name) => sum + fs.lstatSync(path.join(directory, name)).size, 0)
}
/** Call only while the cache writer is idle. */
export function pruneOfflineFiles(db: ApiDb, directory = offlineDirectory(db)) {
  if (!fs.existsSync(directory)) return
  // Interrupted downloads/orphaned files are never playable and can be reclaimed.
  const referenced = new Set(db.drizzle.select().from(offlineCopies).all().map(row => row.fileName))
  for (const name of fs.readdirSync(directory)) if (/^[a-f0-9-]{36}\.(media|part)$/.test(name) && !referenced.has(name)) fs.rmSync(path.join(directory, name), {force: true})
}
export function offlineLimit(db: ApiDb) {
  return db.drizzle.select().from(sourceCacheSettings).where(eq(sourceCacheSettings.id, 1)).get()?.limitBytes ?? DEFAULT_OFFLINE_LIMIT
}
export function getOfflineFile(db: ApiDb, mediaId: number, directory = offlineDirectory(db)) {
  const resolved = resolveMediaLocation(db, mediaId)
  if (resolved.provider === 'local') throw sourceError('unsupported_source', 400)
  const copy = db.drizzle.select().from(offlineCopies).where(eq(offlineCopies.locationId, resolved.location.id)).get()
  if (!copy) return {resolved, copy: undefined, filename: undefined, ready: false}
  const filename = cachePath(directory, copy.fileName)
  const stat = fs.existsSync(filename) ? fs.lstatSync(filename) : undefined
  return {resolved, copy, filename, ready: !copy.invalidated && copy.version === resolved.location.version && stat?.isFile() === true && stat.size === copy.size}
}
export function offlineStatus(db: ApiDb, mediaId: number, directory = offlineDirectory(db)): OfflineStatus {
  const {copy, ready} = getOfflineFile(db, mediaId, directory)
  return {state: !copy ? 'absent' : ready ? 'ready' : 'stale', size: copy?.size || 0, version: copy?.version,
    usedBytes: offlineUsage(directory), limitBytes: offlineLimit(db)}
}
export function offlinePlayback(db: ApiDb, mediaId: number) {
  const file = getOfflineFile(db, mediaId)
  if (!file.ready) return null
  return {url: `/api/source-catalog/media/${mediaId}/offline/stream`, kind: 'mp4' as const,
    title: file.resolved.card.name || '', qualities: [], quality: null, adaptive: false}
}
export function sendOfflineFile(db: ApiDb, mediaId: number, res: Response, directory = offlineDirectory(db)) {
  const file = getOfflineFile(db, mediaId, directory)
  if (!file.ready || !file.filename || !file.copy) throw sourceError('offline_copy_stale')
  res.setHeader('Content-Type', file.copy.contentType)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.sendFile(file.filename, {cacheControl: false, headers: {'Cache-Control': 'no-store'}})
}

/** Must run under the service's single cache writer lock, including limit edits/removals. */
export async function saveOfflineFile(options: {db: ApiDb; mediaId: number; adapter: SourceReadAdapter; signal: AbortSignal;
  assertCurrent: () => void; progress: (bytes: number) => void; directory?: string}) {
  const {db, mediaId, adapter, signal, assertCurrent, progress} = options
  const directory = options.directory || offlineDirectory(db)
  const initial = getOfflineFile(db, mediaId, directory)
  const location = initial.resolved.location
  const expectedPath = initial.resolved.card.path
  fs.mkdirSync(directory, {recursive: true, mode: 0o700})
  pruneOfflineFiles(db, directory)
  const before = await adapter.stat(location.resourceKey, signal)
  assertCurrent(); signal.throwIfAborted()
  const invalidate = () => { if (initial.copy) db.drizzle.update(offlineCopies).set({invalidated: true}).where(eq(offlineCopies.locationId, location.id)).run() }
  if (!before.version || !(initial.resolved.provider === 'nas' ? nasVersionMatches(location.version, before.version) : before.version === location.version) || before.isDirectory || !Number.isSafeInteger(before.size) || before.size <= 0) { invalidate(); throw sourceError('source_version_changed') }
  if (initial.ready) return
  const used = offlineUsage(directory)
  // Replacement also needs temporary space: old complete copy stays until verification succeeds.
  const limit = offlineLimit(db)
  if (used + before.size > limit) throw sourceError('offline_limit_exceeded', 413)
  const space = fs.statfsSync(directory)
  if (space.bavail * space.bsize < before.size) throw sourceError('offline_disk_full', 507)
  const id = randomUUID()
  const temporary = path.join(directory, `${id}.part`)
  const fileName = `${id}.media`
  const final = cachePath(directory, fileName)
  let published = false
  let bytes = 0
  try {
    const download = await adapter.read(location.resourceKey, undefined, signal)
    if (download.status !== 200) {
      if (!Buffer.isBuffer(download.body)) download.body.destroy()
      throw sourceError('offline_download_failed')
    }
    const body = Buffer.isBuffer(download.body) ? Readable.from([download.body]) : download.body
    await pipeline(body, new Transform({transform(chunk: Buffer, _encoding, callback) {
      try {
        assertCurrent(); signal.throwIfAborted()
        bytes += chunk.length
        if (bytes > before.size || used + bytes > limit) throw sourceError('offline_limit_exceeded', 413)
        progress(bytes); callback(null, chunk)
      } catch (err) { callback(err as Error) }
    }}), fs.createWriteStream(temporary, {flags: 'wx', mode: 0o600}), {signal})
    const after = await adapter.stat(location.resourceKey, signal)
    assertCurrent(); signal.throwIfAborted()
    const current = getOfflineFile(db, mediaId, directory)
    if (after.version !== before.version || after.size !== before.size || bytes !== before.size || current.resolved.card.path !== expectedPath
      || current.resolved.location.id !== location.id || current.resolved.location.version !== location.version) { invalidate(); throw sourceError('source_version_changed') }
    fs.renameSync(temporary, final)
    db.drizzle.insert(offlineCopies).values({locationId: location.id, version: location.version, invalidated: false, size: bytes, fileName, contentType: before.contentType})
      .onConflictDoUpdate({target: offlineCopies.locationId, set: {version: location.version, invalidated: false, size: bytes, fileName, contentType: before.contentType}}).run()
    published = true
    if (initial.copy) fs.rmSync(cachePath(directory, initial.copy.fileName), {force: true})
  } finally {
    fs.rmSync(temporary, {force: true})
    if (!published) fs.rmSync(final, {force: true})
  }
}
export function removeOfflineFile(db: ApiDb, mediaId: number, directory = offlineDirectory(db)) {
  const {copy} = getOfflineFile(db, mediaId, directory)
  if (!copy) return
  fs.rmSync(cachePath(directory, copy.fileName), {force: true})
  db.drizzle.delete(offlineCopies).where(eq(offlineCopies.locationId, copy.locationId)).run()
}
