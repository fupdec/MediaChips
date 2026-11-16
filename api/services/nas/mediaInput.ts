import http from 'http'
import {randomUUID} from 'crypto'
import {Readable, Transform} from 'stream'
import {pipeline} from 'stream/promises'
import type {Socket} from 'net'
import type {SourceObject, SourceReadAdapter} from '../mediaSources/adapter'
import {parseSourceRange} from '../mediaSources/range'
import {sourceOperation} from '../mediaSources/cancellation'
import {sourceError} from '../mediaSources/context'

/** A private loopback input for one pinned NAS object. Credentials never enter FFmpeg args. */
export async function createNasMediaInput(options: {
  file: SourceObject
  open: (signal: AbortSignal) => Promise<SourceReadAdapter>
  assertCurrent: () => void
  signal: AbortSignal
  maxBytes: number
}) {
  const {file, signal} = options
  signal.throwIfAborted()
  const route = `/${randomUUID()}/media`
  const sockets = new Set<Socket>(), requests = new Set<AbortController>()
  let bytes = 0, count = 0, failure: Error | undefined
  const server = http.createServer((req, res) => {
    void (async () => {
      if (req.url !== route || !['GET', 'HEAD'].includes(req.method || '')) { res.writeHead(404).end(); return }
      if (failure || signal.aborted || ++count > 64) { res.writeHead(429).end(); return }
      options.assertCurrent()
      const range = parseSourceRange(typeof req.headers.range === 'string' ? req.headers.range : undefined, file.size)
      if (!range) { res.writeHead(416, {'Content-Range': `bytes */${file.size}`}).end(); return }
      const headers = {'Content-Type': file.contentType, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store',
        'Content-Length': String(range.end - range.start + 1),
        ...(range.partial ? {'Content-Range': `bytes ${range.start}-${range.end}/${file.size}`} : {}),
      }
      if (req.method === 'HEAD') { res.writeHead(range.partial ? 206 : 200, headers).end(); return }
      const request = new AbortController()
      requests.add(request)
      const active = AbortSignal.any([signal, request.signal])
      const abort = () => request.abort()
      res.once('close', abort)
      let adapter: SourceReadAdapter | undefined
      try {
        adapter = await sourceOperation(() => options.open(active), active)
        const latest = await sourceOperation(() => adapter!.stat(file.resourceKey, active), active)
        if (latest.version !== file.version || latest.size !== file.size || latest.isDirectory) throw sourceError('source_changed')
        options.assertCurrent()
        const result = await adapter.read(file.resourceKey, `bytes=${range.start}-${range.end}`, active)
        if (result.status !== 206 || result.headers['content-range'] !== `bytes ${range.start}-${range.end}/${file.size}`) {
          if (!Buffer.isBuffer(result.body)) result.body.destroy()
          throw sourceError('invalid_range_response')
        }
        active.throwIfAborted(); options.assertCurrent()
        const bound = new Transform({transform(chunk: Buffer, _encoding, callback) {
          if (bytes + chunk.length > options.maxBytes) {
            failure = sourceError('nas_read_limit', 413)
            callback(failure)
          } else { bytes += chunk.length; callback(null, chunk) }
        }})
        res.writeHead(range.partial ? 206 : 200, headers)
        await pipeline(Buffer.isBuffer(result.body) ? Readable.from([result.body]) : result.body, bound, res, {signal: active})
      } finally {
        res.removeListener('close', abort); request.abort(); requests.delete(request); adapter?.close()
      }
    })().catch(err => {
      if (!signal.aborted && (err as {code?: string})?.code === 'source_changed') failure = sourceError('source_changed')
      if (!res.headersSent && !res.destroyed) res.writeHead(502).end()
      else if (!res.destroyed) res.destroy()
    })
  })
  server.requestTimeout = 30_000
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)) })
  const close = () => {
    signal.removeEventListener('abort', close)
    for (const request of requests) request.abort()
    for (const socket of sockets) socket.destroy()
    server.close()
  }
  signal.addEventListener('abort', close, {once: true})
  try {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    signal.throwIfAborted()
  } catch (err) { close(); throw err }
  const port = (server.address() as {port: number}).port
  return {url: `http://127.0.0.1:${port}${route}`, close, get bytesRead() { return bytes }, assertHealthy() {
    signal.throwIfAborted(); if (failure) throw failure
  }}
}
