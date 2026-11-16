import {createHash, randomUUID} from 'crypto'
import type {Request, Response} from 'express'
import {pipeline} from 'stream/promises'
import type {ApiDb} from '../types/db'
import type {SourceReadAdapter} from './mediaSources/adapter'
import {pinSourceDb, sourceError} from './mediaSources/context'
import {resolveMediaLocation} from './mediaSources/locations'

/** A playback URL names one library card and one observed original version. */
export function createCloudPlaybackSessions(db: ApiDb) {
  type Session = {mediaId: number; connectionId: string; key: string; version: string; size: number;
    expires: number; adapter: SourceReadAdapter; assertCurrent: () => void}
  const sessions = new Map<string, Session>()
  const discard = (id: string) => { sessions.get(id)?.adapter.close(); sessions.delete(id) }
  const prune = () => {
    for (const [id, session] of sessions) if (session.expires <= Date.now()) discard(id)
    while (sessions.size >= 100) discard(sessions.keys().next().value!)
  }
  return {
    invalidate(connectionId?: string) {
      for (const [id, session] of sessions) if (!connectionId || session.connectionId === connectionId) discard(id)
    },
    async prepare(mediaId: number, open: (db: ApiDb, connectionId: string) => SourceReadAdapter, signal?: AbortSignal) {
      const pinned = pinSourceDb(db), resolved = resolveMediaLocation(pinned.db, mediaId)
      if (resolved.provider === 'local') throw sourceError('unsupported_source', 400)
      const {card, location, connection} = resolved
      const assertCurrent = () => {
        pinned.assertCurrent()
        if (pinSourceDb(db).db.sqlite !== pinned.db.sqlite) throw sourceError('library_changed')
        const current = resolveMediaLocation(pinned.db, mediaId)
        if (current.provider === 'local' || current.provider !== resolved.provider || current.card.path !== card.path || current.location.id !== location.id
          || current.location.resourceKey !== location.resourceKey || current.location.version !== location.version
          || current.connection.id !== connection.id || current.connection.config !== connection.config
          || current.connection.credentialRef !== connection.credentialRef) throw sourceError('source_changed')
      }
      const adapter = open(pinned.db, connection.id)
      try {
        const file = await adapter.stat(location.resourceKey, signal)
        signal?.throwIfAborted(); assertCurrent()
        if (file.isDirectory || !/^(video\/|audio\/|image\/(jpeg|png|gif|webp|avif|bmp)$)/.test(file.contentType)) throw sourceError('unsupported_media', 415)
        if (!file.version || (location.version && file.version !== location.version)) throw sourceError('source_version_changed')
        prune()
        const id = randomUUID()
        sessions.set(id, {mediaId, connectionId: connection.id, key: location.resourceKey, version: file.version,
          size: file.size, expires: Date.now() + 6 * 60 * 60_000, adapter, assertCurrent})
        return id
      } catch (error) { adapter.close(); throw error }
    },
    async stream(req: Request, res: Response, mediaId: number, id: string, key?: string) {
      const session = sessions.get(id)
      if (!session || session.expires <= Date.now() || session.mediaId !== mediaId || (key !== undefined && key !== session.key)) {
        throw sourceError('expired_session', 410)
      }
      const controller = new AbortController(), abort = () => controller.abort()
      res.once('close', abort)
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)])
      const check = async () => {
        session.assertCurrent()
        const file = await session.adapter.stat(session.key, signal)
        session.assertCurrent()
        if (!sessions.has(id)) throw sourceError('expired_session', 410)
        if (file.isDirectory || file.version !== session.version || file.size !== session.size) throw sourceError('source_version_changed')
        return file
      }
      try {
        const file = await check()
        const result = await session.adapter.read(session.key, req.headers.range, controller.signal)
        try {
          // Catch a replacement during request setup before sending any bytes.
          await check()
          res.status(result.status).set({'Content-Type': file.contentType, 'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'private, no-store', 'Accept-Ranges': 'bytes',
            ETag: `"${createHash('sha256').update(session.version).digest('hex')}"`})
          for (const header of ['content-length', 'content-range']) if (result.headers[header]) res.setHeader(header, result.headers[header]!)
          if (req.method === 'HEAD') res.end()
          else if (Buffer.isBuffer(result.body)) res.end(result.body)
          else await pipeline(result.body, res)
        } finally { if (!Buffer.isBuffer(result.body)) result.body.destroy() }
      } finally { res.removeListener('close', abort); controller.abort() }
    },
  }
}
