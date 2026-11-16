import fs from 'fs'
import path from 'path'
import {createHash} from 'crypto'
import {Readable, Transform} from 'stream'
import {pipeline} from 'stream/promises'
import type {OriginalItem, OriginalTarget} from '../../../shared/originalOperations'
import type {SourceRead, SourceWriteAdapter} from '../mediaSources/adapter'
import {sourceError} from '../mediaSources/context'

export const RESUME_BLOCK_SIZE = 8 * 1024 * 1024
const missing = (err: unknown) => ['ENOENT', 'not_found', 2].includes((err as {code: string}).code)
  || (err as {status: number}).status === 404
const bodyStream = (read: SourceRead) => Buffer.isBuffer(read.body) ? Readable.from([read.body]) : read.body
const discard = (read: SourceRead) => { if (!Buffer.isBuffer(read.body)) read.body.destroy() }
const validRange = (read: SourceRead, start: number, end: number, size: number) => read.status === 206
  && read.headers['content-range'] === `bytes ${start}-${end}/${size}`

/** Journal block hashes before forwarding bytes. Recovery trusts only blocks that
 * are also present on the destination and whose hashes still match. Read-ahead,
 * an unflushed tail, and a lost final reply therefore cannot advance the offset. */
export async function resumableCopy(options: {
  item: OriginalItem; source: OriginalTarget; destination: OriginalTarget; signal: AbortSignal
  open: (ref: OriginalTarget) => Promise<SourceWriteAdapter>
  guard: () => void; save: () => void; progress: (bytes: number) => void
  expectedVersion?: string
}) {
  const {item, source, destination, signal, open, save, progress} = options
  const guard = () => { signal.throwIfAborted(); options.guard() }
  const using = async <T>(ref: OriginalTarget, run: (adapter: SourceWriteAdapter) => Promise<T>) => {
    guard()
    const adapter = await open(ref)
    try { return await run(adapter) } finally { adapter.close() }
  }
  const before = await using(source, adapter => adapter.stat(source.key, signal))
  if (before.isDirectory || !before.version || before.size !== item.total
    || (options.expectedVersion && before.version !== options.expectedVersion)
    || (item.resume && (item.resume.sourceVersion !== before.version || item.resume.sourceSize !== before.size))) throw sourceError('source_changed')
  if (!item.resume) {
    item.resume = {sourceVersion: before.version, sourceSize: before.size, bytes: 0, blocks: []}
    save()
  }
  const checkpoint = item.resume
  let offset = 0
  const digest = createHash('sha256')
  const existing = await using(destination, async adapter => {
    try { return {file: await adapter.stat(destination.key, signal), resumable: !!adapter.resumeWrite} }
    catch (err) { if (missing(err)) return undefined; throw err }
  })
  if (existing?.resumable && !existing.file.isDirectory) {
    const retained = Math.min(checkpoint.blocks.length, Math.floor(existing.file.size / RESUME_BLOCK_SIZE))
    offset = Math.min(retained * RESUME_BLOCK_SIZE, item.total)
    // A final short block is reusable only when the entire file reached disk.
    if (existing.file.size === item.total && checkpoint.bytes === item.total) offset = item.total
    if (offset) await using(destination, async adapter => {
      const read = await adapter.read(destination.key, offset === existing.file.size ? undefined : `bytes=0-${offset - 1}`, signal)
      if (offset === existing.file.size ? read.status !== 200 : !validRange(read, 0, offset - 1, existing.file.size)) {
        discard(read); throw sourceError('size_mismatch')
      }
      let bytes = 0, blockBytes = 0, block = 0, blockDigest = createHash('sha256')
      for await (const raw of bodyStream(read)) {
        guard()
        const chunk = Buffer.from(raw)
        bytes += chunk.length
        if (bytes > offset) throw sourceError('size_mismatch')
        digest.update(chunk)
        for (let start = 0; start < chunk.length;) {
          const end = Math.min(chunk.length, start + RESUME_BLOCK_SIZE - blockBytes)
          blockDigest.update(chunk.subarray(start, end)); blockBytes += end - start; start = end
          if (blockBytes === RESUME_BLOCK_SIZE || bytes === offset && start === chunk.length) {
            if (blockDigest.digest('hex') !== checkpoint.blocks[block++]) throw sourceError('size_mismatch')
            blockDigest = createHash('sha256'); blockBytes = 0
          }
        }
      }
      if (bytes !== offset) throw sourceError('size_mismatch')
    })
  }
  if (!offset) {
    if (existing) await using(destination, async adapter => {
      if (!adapter.remove) throw sourceError('read_only')
      await adapter.remove(destination.key, signal)
    })
    checkpoint.blocks = []; checkpoint.bytes = 0
  } else {
    checkpoint.blocks = checkpoint.blocks.slice(0, Math.ceil(offset / RESUME_BLOCK_SIZE))
    checkpoint.bytes = offset
  }
  item.bytes = offset; save(); progress(offset)
  if (!destination.connectionId) {
    const space = fs.statfsSync(path.dirname(destination.key))
    if (space.bavail * space.bsize < item.total - offset) throw sourceError('no_space', 507)
  }
  if (offset < item.total || !item.total && !existing) {
    await using(source, async adapter => {
      let read: SourceRead
      try { read = await adapter.read(source.key, offset ? `bytes=${offset}-${item.total - 1}` : undefined, signal) }
      catch (err) {
        if (offset && ['range_not_supported', 'invalid_range'].includes((err as {code: string}).code)) {
          delete item.resume; save()
          // Removing only the staging file allows transports without Range to restart safely.
          await using(destination, a => a.remove!(destination.key, signal))
          return
        }
        throw err
      }
      if (offset && !validRange(read, offset, item.total - 1, item.total)) {
        discard(read)
        if (read.status !== 200) throw sourceError('size_mismatch')
        delete item.resume; save()
        await using(destination, a => a.remove!(destination.key, signal))
        return
      }
      if (!offset && read.status !== 200) { discard(read); throw sourceError('size_mismatch') }
      let bytes = offset, blockBytes = 0, blockDigest = createHash('sha256')
      const counter = new Transform({transform(raw: Buffer, _encoding, callback) {
        try {
          guard(); bytes += raw.length
          if (bytes > item.total) throw sourceError('size_mismatch')
          digest.update(raw)
          for (let start = 0; start < raw.length;) {
            const end = Math.min(raw.length, start + RESUME_BLOCK_SIZE - blockBytes)
            blockDigest.update(raw.subarray(start, end)); blockBytes += end - start; start = end
            if (blockBytes === RESUME_BLOCK_SIZE) {
              checkpoint.blocks.push(blockDigest.digest('hex')); checkpoint.bytes += blockBytes
              blockDigest = createHash('sha256'); blockBytes = 0; save()
            }
          }
          callback(null, raw)
        } catch (err) { callback(err as Error) }
      }, flush(callback) {
        try {
          if (bytes !== item.total) throw sourceError('size_mismatch')
          if (blockBytes) { checkpoint.blocks.push(blockDigest.digest('hex')); checkpoint.bytes += blockBytes; save() }
          callback()
        } catch (err) { callback(err as Error) }
      }})
      // pipeline owns all readers, including when a destination fails before consuming input.
      const input = bodyStream(read)
      const writing = using(destination, async target => {
        if (!target.write || offset && !target.resumeWrite) throw sourceError('read_only')
        if (offset) await target.resumeWrite!(destination.key, counter, item.total, offset, bytes => progress(offset + bytes), signal)
        else await target.write(destination.key, counter, item.total, progress, signal)
      }).catch(err => { counter.destroy(err); throw err })
      const results = await Promise.allSettled([pipeline(input, counter, {signal}), writing])
      for (const result of results) if (result.status === 'rejected') throw result.reason
    })
    if (!item.resume) return resumableCopy({...options, expectedVersion: before.version})
  }
  const after = await using(source, adapter => adapter.stat(source.key, signal))
  guard()
  if (after.version !== before.version || after.size !== before.size) throw sourceError('source_changed')
  const written = await using(destination, adapter => adapter.stat(destination.key, signal))
  if (written.isDirectory || written.size !== item.total) throw sourceError('size_mismatch')
  return digest.digest('hex')
}
