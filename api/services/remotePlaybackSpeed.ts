import type {Express, Response} from 'express'

/** Counts bytes sent by the playback proxy, including native video Range requests. */
export function registerRemotePlaybackSpeed(app: Express) {
  const transfers = new Map<string, {bytes: number; updated: number}>()
  const prune = () => {
    const cutoff = Date.now() - 60_000
    for (const [key, value] of transfers) if (value.updated < cutoff) transfers.delete(key)
  }
  app.get('/api/remote-playback-speed/:id', (req, res) => {
    prune()
    res.setHeader('Cache-Control', 'no-store')
    res.json({bytes: transfers.get(String(req.params.id))?.bytes ?? 0})
  })
  app.use('/api', (req, res, next) => {
    const id = req.query.playbackTransfer
    if (req.method !== 'GET' || !req.path.endsWith('/stream') || typeof id !== 'string'
      || !/^[a-f0-9-]{36}$/i.test(id)) return next()
    prune()
    if (!transfers.has(id) && transfers.size >= 1000) return next()
    let transfer = transfers.get(id) ?? {bytes: 0, updated: Date.now()}
    transfers.set(id, transfer)
    const count = (chunk: unknown, encoding?: unknown) => {
      if (res.statusCode >= 400) return
      // A stalled response may outlive the idle entry and then resume.
      const current = transfers.get(id)
      if (current) transfer = current
      else if (transfers.size < 1000) transfers.set(id, transfer)
      else return
      if (typeof chunk === 'string') transfer.bytes += Buffer.byteLength(chunk, typeof encoding === 'string' ? encoding as BufferEncoding : 'utf8')
      else if ((Buffer.isBuffer(chunk) || chunk instanceof Uint8Array)) transfer.bytes += chunk.byteLength
      transfer.updated = Date.now()
    }
    const write = res.write
    res.write = function (this: Response, ...args: Parameters<typeof res.write>) {
      count(args[0], args[1])
      return write.apply(this, args)
    } as typeof res.write
    const end = res.end
    res.end = function (this: Response, ...args: Parameters<typeof res.end>) {
      count(args[0], args[1])
      return end.apply(this, args)
    } as typeof res.end
    next()
  })
}
