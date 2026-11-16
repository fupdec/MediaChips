import {Readable} from 'stream'
import {CHUNK_SIZE, computeOshashFromChunks} from '../oshash'
import type {ApiDb} from '../../types/db'
import type {SourceObject, SourceReadAdapter} from './adapter'
import {openSource, pinSourceDb, sourceError} from './context'
import {resolveMediaLocation, nasVersionMatches} from './locations'

export type OshashSourceFactory = (signal: AbortSignal) => Promise<SourceReadAdapter>

/** Never fall back to a complete GET if a provider ignores the range request. */
async function readSample(adapter: SourceReadAdapter, key: string, start: number, length: number, size: number, signal: AbortSignal) {
  const end = start + length - 1
  const response = await adapter.read(key, `bytes=${start}-${end}`, signal)
  const body = Buffer.isBuffer(response.body) ? Readable.from([response.body]) : response.body
  const abort = () => body.destroy()
  signal.addEventListener('abort', abort, {once: true})
  try {
    signal.throwIfAborted()
    if (response.status !== 206 || response.headers['content-range'] !== `bytes ${start}-${end}/${size}`
      || (response.headers['content-length'] !== undefined && Number(response.headers['content-length']) !== length)
      || (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity')) {
      throw sourceError('range_not_supported', 502)
    }
    const result = Buffer.alloc(length)
    let received = 0
    for await (const chunk of body) {
      signal.throwIfAborted()
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      if (received + bytes.length > length) throw sourceError('invalid_range_response', 502)
      bytes.copy(result, received)
      received += bytes.length
    }
    signal.throwIfAborted()
    if (received !== length) throw sourceError('incomplete_stream', 502)
    return result
  } finally { signal.removeEventListener('abort', abort); body.destroy() }
}

/** Two bounded reads, regardless of file size. Fresh sessions also support FTP's range-close behavior. */
export async function computeSourceOshash(open: OshashSourceFactory, key: string, options: {
  signal?: AbortSignal
  assertCurrent?: () => void
  validate?: (file: SourceObject) => void
} = {}) {
  const signal = options.signal || AbortSignal.timeout(30_000)
  const check = () => { signal.throwIfAborted(); options.assertCurrent?.() }
  const using = async <T>(action: (adapter: SourceReadAdapter) => Promise<T>) => {
    check()
    const adapter = await open(signal)
    try { check(); return await action(adapter) } finally { adapter.close() }
  }
  let before!: SourceObject
  let chunkSize = CHUNK_SIZE
  const unchanged = (current: SourceObject) => {
    check()
    if (current.isDirectory || current.size !== before.size || current.version !== before.version) throw sourceError('source_version_changed')
  }
  const head = await using(async adapter => {
    before = await adapter.stat(key, signal)
    check()
    if (before.isDirectory || !Number.isSafeInteger(before.size) || before.size < 0 || !before.version) throw sourceError('invalid_file', 400)
    if (before.size <= 8) throw sourceError('file_too_small', 400)
    options.validate?.(before)
    chunkSize = before.size < CHUNK_SIZE ? Math.floor(before.size / 8) * 8 : CHUNK_SIZE
    return readSample(adapter, key, 0, chunkSize, before.size, signal)
  })
  const tail = await using(async adapter => {
    unchanged(await adapter.stat(key, signal))
    return readSample(adapter, key, before.size - chunkSize, chunkSize, before.size, signal)
  })
  // FTP closes the session at the end of a bounded read, so stat through a fresh session.
  await using(async adapter => unchanged(await adapter.stat(key, signal)))
  check()
  return {value: computeOshashFromChunks(before.size, head, tail), size: before.size, version: before.version, file: before}
}

export async function computeRemoteMediaOshash(publicDb: ApiDb, mediaId: number, expectedPath: string, options: {
  signal?: AbortSignal
  assertCurrent?: () => void
} = {}) {
  const pinned = pinSourceDb(publicDb)
  const db = pinned.db
  const resolved = resolveMediaLocation(db, mediaId)
  if (resolved.provider === 'local') throw sourceError('unsupported_source', 400)
  const identity = () => {
    const current = resolveMediaLocation(db, mediaId)
    if (current.provider === 'local') throw sourceError('media_changed')
    return JSON.stringify([current.card.path, current.location, current.connection])
  }
  if (resolved.card.path !== expectedPath) throw sourceError('media_changed')
  const initial = identity()
  const assertCurrent = () => {
    pinned.assertCurrent(); options.assertCurrent?.()
    if (identity() !== initial) throw sourceError('media_changed')
  }
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000)
  return computeSourceOshash(signal => openSource(db, resolved.location.connectionId, signal), resolved.location.resourceKey, {
    signal, assertCurrent,
    validate(file) {
      if (resolved.location.version && !(resolved.provider === 'nas' ? nasVersionMatches(resolved.location.version, file.version) : resolved.location.version === file.version)) {
        throw sourceError('source_version_changed')
      }
    },
  })
}
