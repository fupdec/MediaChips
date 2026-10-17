import fs from 'fs'
import path from 'path'
import {pipeline} from 'stream/promises'
import {Transform} from 'stream'
import type {SourceObject, SourceWriteAdapter} from './adapter'
import {sourceError} from './context'

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
        version: `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`, contentType: 'application/octet-stream'}
    },
    async list(key) {
      const entries = []
      for (const name of await fs.promises.readdir(keyFor(key))) entries.push(await this.stat(path.join(key, name)))
      return {entries}
    },
    async read(key, _range, signal) { return {status: 200, headers: {}, body: fs.createReadStream(keyFor(key), {signal})} },
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
    // A hard link publishes an already complete staging file without replacing a racer.
    async move(from, to) { await fs.promises.link(keyFor(from), keyFor(to)); await fs.promises.unlink(from) },
    async remove(key) { await fs.promises.unlink(keyFor(key)) },
    close() {},
  }
}
