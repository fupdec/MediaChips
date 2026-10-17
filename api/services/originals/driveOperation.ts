import fs from 'fs'
import path from 'path'
import {createHash} from 'crypto'
import {Transform} from 'stream'
import {eq} from 'drizzle-orm'
import type {ApiDb} from '../../types/db'
import type {DriveTransport} from '../cloudDrive/types'
import type {OriginalItem} from '../../../shared/originalOperations'
import {driveFileVersion} from '../mediaSources/adapter'
import {DriveFileIdSchema} from '../../../shared/cloudDrive'
import {sourceError} from '../mediaSources/context'
import {media} from '../../db/schema/media'
import {mediaLocations, offlineCopies} from '../../db/schema/mediaSources'
import {mediaFileContentType} from '../../../shared/mediaFormats'

const missing = (err: unknown) => (err as {status?: number; response?: {status?: number}}).status === 404 || (err as {response?: {status?: number}}).response?.status === 404
async function fileChecksum(filename: string) {
  const digest = createHash('md5')
  for await (const chunk of fs.createReadStream(filename)) digest.update(chunk)
  return digest.digest('hex')
}
/** Drive IDs survive rename/move; reserved IDs make creation safe to retry. */
export async function runDriveOriginal(options: {db: ApiDb; item: OriginalItem; transport: DriveTransport; signal: AbortSignal;
  save: () => void; guard: () => void; spool: string; progress: (bytes: number) => void}) {
  const {db, item, transport, signal, save, guard, spool, progress} = options
  const writes = transport.originals
  if (!writes) throw sourceError('read_only')
  const stat = async (id: string) => {
    try { return await transport.getFileMeta(DriveFileIdSchema.parse(id), signal) } catch (err) { if (missing(err)) return undefined; throw err }
  }
  const sourceId = item.source?.key
  const source = sourceId ? await stat(sourceId) : undefined
  const names = async (parent: string) => {
    const result = new Set<string>(), tokens = new Set<string>()
    let token: string | undefined, count = 0
    do {
      const page = await transport.listFolder(parent, token, signal)
      for (const file of page.files) if (file.id !== item.drive?.fileId && file.id !== sourceId) result.add(file.name)
      count += page.files.length
      if (count > 500_000 || (page.nextPageToken && tokens.has(page.nextPageToken))) throw sourceError('operation_failed')
      token = page.nextPageToken
      if (token) tokens.add(token)
    } while (token)
    return result
  }
  if (item.phase === 'pending') {
    if (sourceId && !source) throw sourceError('not_found', 404)
    if (source && item.version && item.version !== driveFileVersion(source)) throw sourceError('source_changed')
    if (source?.mimeType.startsWith('application/vnd.google-apps.')) throw sourceError('invalid_file')
    if (source) { item.version = driveFileVersion(source); item.total = source.size }
    if (item.kind === 'delete') {
      item.drive = {fileId: sourceId, parentId: '', name: source!.name, sourceName: source!.name, checksum: source!.md5Checksum, etag: source!.etag}
    } else {
      const parent = await stat(item.target!.key)
      if (parent?.mimeType !== 'application/vnd.google-apps.folder') throw sourceError('invalid_path')
      if (item.kind === 'rename' && !source?.parents?.includes(parent.id)) throw sourceError('invalid_path')
      const name = item.target!.name || (item.kind === 'move' ? source!.name : '')
      if (!name || /[\/\\\x00-\x1f]/.test(name) || name === '.' || name === '..') throw sourceError('invalid_path')
      item.drive = {fileId: sourceId, parentId: parent.id, name, sourceName: source?.name, checksum: source?.md5Checksum, etag: source?.etag}
      const existing = await names(parent.id)
      if (existing.has(name)) {
        if (item.conflict === 'skip') { item.state = 'skipped'; save(); return }
        if (item.conflict === 'fail') throw sourceError('conflict')
        const ext = item.kind === 'mkdir' ? '' : path.extname(name)
        const stem = name.slice(0, name.length - ext.length)
        let n = 1
        while (existing.has(`${stem} (${n})${ext}`)) n++
        item.drive.name = `${stem} (${n})${ext}`
      }
      if (item.kind === 'upload') {
        if (!item.readyUpload) throw sourceError('upload_required')
        item.total = item.uploadSize!; item.drive.checksum = await fileChecksum(spool)
      }
      if (!sourceId) item.drive.fileId = await writes.generateId(signal)
    }
    item.phase = 'prepared'; save()
  }
  const checkpoint = item.drive!
  const id = checkpoint.fileId!
  if (item.kind === 'delete') {
    const current = await stat(id)
    if (current) {
      if (driveFileVersion(current) !== item.version) throw sourceError('source_changed')
      item.phase = 'mutating'; save(); guard()
      await writes.remove(id, current.etag, signal)
    }
    guard()
    db.drizzle.update(mediaLocations).set({availability: 'unavailable'}).where(eq(mediaLocations.mediaId, item.mediaId!)).run()
    item.phase = 'removed'; save()
  } else {
    let current = await stat(id)
    if (!current && sourceId) throw sourceError('not_found')
    if (!current) {
      item.phase = 'mutating'; save(); guard()
      let stream: fs.ReadStream | undefined
      let counter: Transform | undefined
      try {
        if (item.kind === 'upload') {
          stream = fs.createReadStream(spool, {signal})
          let bytes = 0
          counter = new Transform({transform(chunk: Buffer, _encoding, callback) {
            try { bytes += chunk.length; progress(bytes); callback(null, chunk) } catch (err) { callback(err as Error) }
          }})
          stream.on('error', err => counter!.destroy(err)); counter.on('error', () => {})
          stream.pipe(counter)
        }
        current = await writes.create(id, checkpoint.parentId, item.kind === 'upload' ? `.mediachips-${item.id}.part` : checkpoint.name, counter, item.total, signal, mediaFileContentType(checkpoint.name) || 'application/octet-stream')
      } finally { stream?.destroy(); counter?.destroy() }
    }
    if (item.kind !== 'mkdir' && (current.size !== item.total || !checkpoint.checksum || current.md5Checksum !== checkpoint.checksum)) throw sourceError('source_changed')
    if (item.kind === 'mkdir' && current.mimeType !== 'application/vnd.google-apps.folder') throw sourceError('conflict')
    const occupied = await names(checkpoint.parentId)
    if (occupied.has(checkpoint.name)) {
      if (item.conflict !== 'keep-both') throw sourceError('conflict')
      const ext = item.kind === 'mkdir' ? '' : path.extname(checkpoint.name)
      const stem = checkpoint.name.slice(0, checkpoint.name.length - ext.length)
      let n = 1
      while (occupied.has(`${stem} (${n})${ext}`)) n++
      checkpoint.name = `${stem} (${n})${ext}`; save()
    }
    if (current.name !== checkpoint.name || !current.parents?.includes(checkpoint.parentId)) {
      // A failed reply may already have applied our change. Check the object ID,
      // checksum, current name and parent before deciding whether another write is needed.
      if (sourceId && item.phase === 'prepared' && driveFileVersion(current) !== item.version) throw sourceError('source_changed')
      if ((await names(checkpoint.parentId)).has(checkpoint.name)) throw sourceError('conflict')
      item.phase = 'mutating'; save(); guard()
      current = await writes.update(id, checkpoint.name, checkpoint.parentId, current.etag, signal)
    }
    item.phase = 'published'; save(); guard()
    if ((await names(checkpoint.parentId)).has(checkpoint.name)) throw sourceError('conflict')
    if (sourceId) {
      db.sqlite.transaction(() => {
        // The gdrive:// identity and user title stay unchanged.
        db.drizzle.update(media).set({basename: current!.name, ext: path.extname(current!.name).slice(1).toLowerCase()}).where(eq(media.id, item.mediaId!)).run()
        const locations = db.drizzle.select().from(mediaLocations).where(eq(mediaLocations.mediaId, item.mediaId!)).all()
        for (const location of locations.filter(row => row.connectionId === 'google-drive' && row.resourceKey === id)) {
          db.drizzle.update(mediaLocations).set({version: driveFileVersion(current!), availability: 'available', lastVerifiedAt: new Date().toISOString()}).where(eq(mediaLocations.id, location.id)).run()
          db.drizzle.update(offlineCopies).set({version: driveFileVersion(current!)}).where(eq(offlineCopies.locationId, location.id)).run()
        }
      })()
    }
    item.phase = 'linked'; save()
  }
  item.state = 'completed'; item.bytes = item.total; delete item.error; save()
  if (item.kind === 'upload') fs.rmSync(spool, {force: true})
}
