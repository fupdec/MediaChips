import fs from 'fs'
import path from 'path'
import {pipeline} from 'stream/promises'
import {Transform, Writable} from 'stream'
import type {SourceObject, SourceWriteAdapter} from './adapter'
import {sourceError} from './context'
import {parseSourceRange} from './range'
import {mediaFileContentType} from '../../../shared/mediaFormats'

export function localOriginalKey(key: string) {
  if (!path.isAbsolute(key) || key.includes('://') || key.includes('!/') || /[\x00-\x1f]/.test(key)) throw sourceError('invalid_path', 400)
  return path.normalize(key)
}
export function createLocalOriginalAdapter(): SourceWriteAdapter {
  const keyFor = localOriginalKey
  return {
    provider: 'local', capabilities: {view: true, seek: true, download: true, move: true, delete: true},
    async stat(key): Promise<SourceObject> {
      key = keyFor(key)
      const stat = await fs.promises.lstat(key)
      if (!stat.isFile() && !stat.isDirectory()) throw sourceError('invalid_file', 400)
      return {resourceKey: key, name: path.basename(key), size: stat.size, isDirectory: stat.isDirectory(),
        version: `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`, contentType: mediaFileContentType(key) || 'application/octet-stream'}
    },
    async list(key, _token, signal) {
      const entries = []
      for (const entry of await fs.promises.readdir(keyFor(key), {withFileTypes: true})) {
        signal?.throwIfAborted()
        if (entry.isFile() || entry.isDirectory()) entries.push(await this.stat(path.join(key, entry.name), signal))
      }
      return {entries}
    },
    async read(key, rangeHeader, signal) {
      key = keyFor(key)
      const file = await this.stat(key, signal)
      if (file.isDirectory) throw sourceError('invalid_file', 400)
      const range = parseSourceRange(rangeHeader, file.size)
      if (!range) throw sourceError('invalid_range', 416)
      return {status: range.partial ? 206 : 200, headers: {
        'content-type': file.contentType, 'content-length': String(file.size ? range.end - range.start + 1 : 0),
        'accept-ranges': 'bytes', 'content-range': range.partial ? `bytes ${range.start}-${range.end}/${file.size}` : undefined,
      }, body: fs.createReadStream(key, {signal, start: range.start, ...(file.size ? {end: range.end} : {})})}
    },
    async mkdir(key) { await fs.promises.mkdir(keyFor(key)) },
    async write(key, input, size, progress, signal) {
      let bytes = 0
      await pipeline(input, new Transform({transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length
        progress(bytes)
        callback(bytes > size ? sourceError('size_mismatch') : null, chunk)
      }}), fs.createWriteStream(keyFor(key), {flags: 'wx', mode: 0o600}), {signal})
      if (bytes !== size) throw sourceError('size_mismatch')
    },
    async resumeWrite(key, input, size, offset, progress, signal) {
      const handle = await fs.promises.open(keyFor(key), fs.constants.O_RDWR | fs.constants.O_NOFOLLOW)
      try {
        const file = await handle.stat()
        if (!file.isFile() || file.size < offset || offset < 0 || offset > size) throw sourceError('size_mismatch')
        await handle.truncate(offset)
        const start = offset
        let bytes = 0
        await pipeline(input, new Transform({transform(chunk: Buffer, _encoding, callback) {
          bytes += chunk.length; progress(bytes)
          callback(bytes + start > size ? sourceError('size_mismatch') : null, chunk)
        }}), new Writable({write(chunk: Buffer, _encoding, callback) {
          const write = async () => {
            let written = 0
            while (written < chunk.length) {
              const result = await handle.write(chunk, written, chunk.length - written, offset)
              if (!result.bytesWritten) throw sourceError('size_mismatch')
              written += result.bytesWritten; offset += result.bytesWritten
            }
          }
          void write().then(() => callback(), err => callback(err))
        }}), {signal})
        if (offset !== size) throw sourceError('size_mismatch')
        await handle.sync()
      } finally { await handle.close() }
    },
    // A hard link publishes an already complete staging file without replacing a racer.
    async move(from, to) { await fs.promises.link(keyFor(from), keyFor(to)); await fs.promises.unlink(from) },
    async remove(key) { await fs.promises.unlink(keyFor(key)) },
    close() {},
  }
}
