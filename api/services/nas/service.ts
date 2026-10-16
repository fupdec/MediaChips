import {randomUUID, createHash} from 'crypto'
import path from 'path'
import {Readable} from 'stream'
import {pipeline} from 'stream/promises'
import type {Request, Response} from 'express'
import {eq, and, inArray} from 'drizzle-orm'
import type {ApiDb} from '../../types/db'
import {sourceConnections, mediaLocations} from '../../db/schema/mediaSources'
import {createMediaRepository} from '../../db/repositories/media'
import {createMediaTypesRepository} from '../../db/repositories/mediaTypes'
import {createVideoMetadataRepository} from '../../db/repositories/videoMetadata'
import {NasConnectionSchema, type NasConnectionInput, type NasConnection, type NasImportResult} from '../../../shared/nas'
import {nasMediaPath, parseNasMediaPath} from '../../../shared/remoteMedia'
import {READ_SOURCE_CAPABILITIES} from '../../../shared/mediaSources'
import {createNasSourceAdapter} from '../mediaSources/nasAdapter'
import {nasFileVersion, type SourceReadAdapter} from '../mediaSources/adapter'
import {resolveMediaLocation, nasVersionMatches} from '../mediaSources/locations'
import {parseSourceRange} from '../mediaSources/range'
import {createNasCredentialStore, type NasCredentialStore, type NasCredentials} from './credentials'
import {connectNas, normalizeNasRelativePath, type NasTransport, type NasFile} from './transport'
import {NasError, normalizeNasError} from './errors'
import {mediaFileKind, mediaFileContentType} from '../../../shared/mediaFormats'
import {invalidateMediaDerivedCaches} from '../mediaCacheInvalidation'
import {markCatalogSourceDisconnected} from '../mediaCatalogSources'

type Connector = typeof connectNas
type PlaybackSession = {library: string; mediaId: number | null; mediaPath: string | null; locationId: string | null; connectionId: string; path: string; size: number; version: string; expires: number}
export const parseNasRange = parseSourceRange
const fileVersion = nasFileVersion

/** One service per API process; every operation also checks the active library. */
export function createNasService(options: {connect?: Connector; credentials?: NasCredentialStore} = {}) {
  const connect = options.connect || connectNas
  const secrets = options.credentials || createNasCredentialStore()
  const sessions = new Map<string, PlaybackSession>()
  const activeRequests = new Map<string, Set<AbortController>>()
  const track = (id: string, controller: AbortController) => {
    const requests = activeRequests.get(id) || new Set<AbortController>()
    requests.add(controller); activeRequests.set(id, requests)
    return () => { requests.delete(controller); if (!requests.size) activeRequests.delete(id) }
  }
  const invalidateConnection = (id: string) => {
    for (const [key, session] of sessions) if (session.connectionId === id) sessions.delete(key)
    for (const controller of activeRequests.get(id) || []) controller.abort()
  }
  const libraryKey = (db: ApiDb) => String(db.path || db.config?.id || '')
  const playbackPlan = (db: ApiDb, session: Omit<PlaybackSession, 'library' | 'expires'>, title: string) => {
    for (const [key, value] of sessions) if (value.expires < Date.now()) sessions.delete(key)
    while (sessions.size >= 100) sessions.delete(sessions.keys().next().value!)
    const id = randomUUID()
    sessions.set(id, {...session, library: libraryKey(db), expires: Date.now() + 6 * 60 * 60_000})
    const route = session.mediaId == null ? `/connections/${session.connectionId}` : `/media/${session.mediaId}`
    return {url: `/api/nas${route}/stream?session=${id}`, kind: 'mp4' as const,
      title, qualities: [], quality: null, adaptive: false}
  }
  const connectionRow = (db: ApiDb, id: string) => {
    const row = db.drizzle.select().from(sourceConnections).where(eq(sourceConnections.id, id)).get()
    if (!row || row.provider !== 'nas') throw new NasError('connection_not_found', 'NAS connection is unavailable in this library.', 404)
    return row
  }
  const publicConnection = (row: typeof sourceConnections.$inferSelect): NasConnection => {
    const config = NasConnectionSchema.parse(JSON.parse(row.config))
    let credentials: NasCredentials = {}
    if (secrets.has(row.credentialRef)) {
      try { credentials = secrets.get(row.credentialRef) } catch { /* Allow re-entry if the local vault is unavailable. */ }
    }
    const hasPassword = Boolean(credentials.password)
    const hasPrivateKey = Boolean(credentials.privateKey)
    return {...config, id: row.id, hasCredentials: hasPassword || hasPrivateKey, hasPassword, hasPrivateKey, capabilities: READ_SOURCE_CAPABILITIES}
  }
  const withTransport = async <T>(db: ApiDb, id: string, action: (transport: SourceReadAdapter, assertCurrent: () => void) => Promise<T>, signal?: AbortSignal) => {
    const library = libraryKey(db)
    const sqlite = db.sqlite
    const row = connectionRow(db, id)
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal?.addEventListener('abort', abort, {once: true})
    if (signal?.aborted) abort()
    const assertCurrent = () => {
      if (libraryKey(db) !== library || db.sqlite !== sqlite) throw new NasError('library_changed', 'The active library changed. Try again.', 409)
      if (controller.signal.aborted) throw new NasError('cancelled', 'NAS request cancelled.', 499)
      clearTimeout(timer); timer = setTimeout(() => controller.abort(), 30_000)
    }
    const untrack = track(id, controller)
    let timer = setTimeout(() => controller.abort(), 30_000)
    let transport: NasTransport | undefined
    try {
      transport = await connect(NasConnectionSchema.parse(JSON.parse(row.config)), secrets.get(row.credentialRef), controller.signal)
      assertCurrent()
      const result = await action(createNasSourceAdapter(transport), assertCurrent)
      assertCurrent()
      return result
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); untrack(); transport?.close() }
  }

  const importPath = (input: string) => {
    const resourceKey = normalizeNasRelativePath(input)
    const ext = path.posix.extname(resourceKey).slice(1).toLowerCase()
    const kind = mediaFileKind(resourceKey)
    if (!kind) throw new NasError('unsupported_format', 'Select a supported video, audio or image file.', 415)
    return {resourceKey, ext, kind}
  }
  const storeFile = (db: ApiDb, connectionId: string, input: string, file: NasFile) => {
    const {resourceKey, ext, kind} = importPath(input)
    if (file.isDirectory || !Number.isSafeInteger(file.size) || file.size <= 0) throw new NasError('invalid_file', 'Select a non-empty media file.')
    const repo = createMediaRepository(db.drizzle)
    const version = fileVersion(file)
    const existingLocation = db.drizzle.select().from(mediaLocations).where(and(eq(mediaLocations.connectionId, connectionId), eq(mediaLocations.resourceKey, resourceKey))).all()
      .find(location => nasVersionMatches(location.version, version))
    if (existingLocation) {
      const existing = repo.findById(existingLocation.mediaId)
      if (existing?.deletedAt) throw new NasError('in_trash', 'Restore this file from Trash before importing it again.', 409)
      if (existing) {
        db.drizzle.update(mediaLocations).set({version, availability: 'available', lastVerifiedAt: new Date().toISOString()})
          .where(eq(mediaLocations.id, existingLocation.id)).run()
        return {id: existing.id, title: existing.name || path.posix.basename(resourceKey), created: false}
      }
    }
    const type = createMediaTypesRepository(db.drizzle).findByType(kind)
    if (!type) throw new NasError('media_type', 'This media type is not configured.')
    const result = db.drizzle.transaction(tx => {
      const txRepo = createMediaRepository(tx)
      const item = txRepo.findOrCreateByPath(nasMediaPath(connectionId, resourceKey, createHash('sha256').update(version).digest('hex')), {
        name: path.posix.basename(resourceKey, `.${ext}`), basename: path.posix.basename(resourceKey), ext,
        filesize: file.size, mediaTypeId: type.id,
      })
      if (item.row.deletedAt) throw new NasError('in_trash', 'Restore this file from Trash before importing it again.', 409)
      tx.insert(mediaLocations).values({id: randomUUID(), mediaId: item.row.id, connectionId, resourceKey, version: fileVersion(file), availability: 'available', lastVerifiedAt: new Date().toISOString()}).onConflictDoNothing().run()
      if (item.created && kind !== 'image') createVideoMetadataRepository(tx).create({mediaId: item.row.id, duration: 0})
      return {id: item.row.id, title: item.row.name || path.posix.basename(resourceKey), created: item.created}
    })
    return result
  }

  return {
    connections(db: ApiDb): NasConnection[] { return db.drizzle.select().from(sourceConnections).where(eq(sourceConnections.provider, 'nas')).all().map(publicConnection) },
    async saveConnection(db: ApiDb, raw: NasConnectionInput, id: string = randomUUID()) {
      const input = NasConnectionSchema.parse(raw)
      const library = libraryKey(db)
      const old = db.drizzle.select().from(sourceConnections).where(eq(sourceConnections.id, id)).get()
      if (old && old.provider !== 'nas') throw new NasError('connection_identity', 'This connection belongs to another provider.', 409)
      const sqlite = db.sqlite
      const credentials: NasCredentials = {password: input.password, privateKey: input.privateKey, passphrase: input.passphrase}
      // An empty editor field means keep the saved credentials, also for API clients.
      const hasNewSecret = Boolean(input.password || input.privateKey)
      const secret = hasNewSecret ? credentials : old ? secrets.get(old.credentialRef) : {}
      if (!secret.password && !secret.privateKey) throw new NasError('credentials_required', 'Enter a password or SSH private key.', 400)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 30_000)
      let transport: NasTransport | undefined
      try {
        transport = await connect(input, secret, controller.signal)
        await transport.list('')
        if (libraryKey(db) !== library || db.sqlite !== sqlite) throw new NasError('library_changed', 'The active library changed. Try again.', 409)
        if (old) {
          const previous = NasConnectionSchema.parse(JSON.parse(old.config))
          if (['protocol', 'host', 'port', 'username', 'root'].some(k => previous[k as keyof NasConnectionInput] !== input[k as keyof NasConnectionInput])) {
            throw new NasError('connection_identity', 'Create a new connection to change the server, account or root folder.', 409)
          }
        }
        const {password: _password, privateKey: _key, passphrase: _passphrase, ...config} = input
        const ref = old?.credentialRef || randomUUID()
        if (hasNewSecret) secrets.set(ref, secret)
        try {
          db.drizzle.insert(sourceConnections).values({id, provider: 'nas', config: JSON.stringify(config), credentialRef: ref, createdAt: new Date().toISOString()})
            .onConflictDoUpdate({target: sourceConnections.id, set: {config: JSON.stringify(config)}}).run()
        } catch (err) { if (!old) secrets.delete(ref); throw err }
        invalidateConnection(id)
        return publicConnection(connectionRow(db, id))
      } finally { clearTimeout(timer); transport?.close() }
    },
    disconnect(db: ApiDb, id: string) {
      const row = connectionRow(db, id)
      secrets.delete(row.credentialRef)
      invalidateConnection(id)
      markCatalogSourceDisconnected(db, id)
      // Keep connection metadata and media locations so re-authentication preserves identity.
    },
    async list(db: ApiDb, id: string, relative: string, pageToken?: string) {
      const normalized = normalizeNasRelativePath(relative)
      const page = await withTransport(db, id, transport => transport.list(normalized, pageToken))
      const visible = page.entries.map(entry => ({...entry, path: entry.resourceKey}))
      const filePaths = visible.filter(entry => !entry.isDirectory).map(entry => entry.path)
      const locations = filePaths.length ? db.drizzle.select().from(mediaLocations).where(and(
        eq(mediaLocations.connectionId, id), inArray(mediaLocations.resourceKey, filePaths),
      )).all() : []
      const imported = new Map(locations.map(location => [JSON.stringify([location.resourceKey, location.version]), location.mediaId]))
      return {path: normalized, entries: visible.map(entry => ({...entry,
        mediaId: entry.isDirectory ? null : imported.get(JSON.stringify([entry.path, fileVersion(entry)])) ?? null,
      })),
        truncated: Boolean(page.nextPageToken), nextPageToken: page.nextPageToken}
    },
    async importFile(db: ApiDb, connectionId: string, input: string) {
      const {resourceKey} = importPath(input)
      const file = await withTransport(db, connectionId, transport => transport.stat(resourceKey))
      const result = storeFile(db, connectionId, resourceKey, file)
      invalidateMediaDerivedCaches()
      return result
    },
    async importFiles(db: ApiDb, connectionId: string, inputs: string[], signal?: AbortSignal): Promise<{results: NasImportResult[]}> {
      if (!inputs.length || inputs.length > 20) throw new NasError('invalid_request', 'Select between 1 and 20 files per request.', 400)
      try {
        return await withTransport(db, connectionId, async (transport, assertCurrent) => {
          const results: NasImportResult[] = []
          for (const input of new Set(inputs)) {
            assertCurrent()
            try {
              const {resourceKey} = importPath(input)
              const file = await transport.stat(resourceKey)
              assertCurrent()
              results.push({path: input, ok: true, ...storeFile(db, connectionId, resourceKey, file)})
            } catch (err) {
              assertCurrent()
              const error = normalizeNasError(err)
              results.push({path: input, ok: false, code: error.code, message: error.message})
            }
          }
          return {results}
        }, signal)
      } finally { invalidateMediaDerivedCaches() }
    },
    async preparePreview(db: ApiDb, connectionId: string, input: string, signal?: AbortSignal) {
      const {resourceKey} = importPath(input)
      const file = await withTransport(db, connectionId, transport => transport.stat(resourceKey), signal)
      if (file.isDirectory || !Number.isSafeInteger(file.size) || file.size <= 0) throw new NasError('invalid_file', 'Select a non-empty media file.')
      return playbackPlan(db, {mediaId: null, mediaPath: null, locationId: null, connectionId,
        path: resourceKey, size: file.size, version: fileVersion(file)}, path.posix.basename(resourceKey))
    },
    async prepare(db: ApiDb, mediaId: number, signal?: AbortSignal) {
      const media = createMediaRepository(db.drizzle).findById(mediaId)
      if (!media || media.deletedAt || !parseNasMediaPath(media.path)) throw new NasError('not_found', 'NAS file is unavailable.', 404)
      let resolved: ReturnType<typeof resolveMediaLocation>
      try { resolved = resolveMediaLocation(db, mediaId) }
      catch { throw new NasError('location_not_found', 'NAS location is missing. Reconnect and import the file again.', 409) }
      if (resolved.provider !== 'nas') throw new NasError('not_found', 'NAS file is unavailable.', 404)
      const location = resolved.location
      const originalPath = media.path
      const file = await withTransport(db, location.connectionId, transport => transport.stat(location.resourceKey), signal)
      if (file.isDirectory || !Number.isSafeInteger(file.size) || file.size <= 0) throw new NasError('not_found', 'NAS file is unavailable.', 404)
      const current = createMediaRepository(db.drizzle).findById(mediaId)
      if (!current || current.deletedAt || current.path !== originalPath) throw new NasError('media_changed', 'The file changed. Open it again.', 409)
      if (!nasVersionMatches(location.version, fileVersion(file))) throw new NasError('file_changed', 'The NAS file changed since import. Re-import it as a new version before using saved markers.', 409)
      db.drizzle.update(mediaLocations).set({version: fileVersion(file), availability: 'available', lastVerifiedAt: new Date().toISOString()}).where(eq(mediaLocations.id, location.id)).run()
      if (location.availability !== 'available') invalidateMediaDerivedCaches()
      return playbackPlan(db, {mediaId, mediaPath: originalPath, locationId: location.id, connectionId: location.connectionId,
        path: location.resourceKey, size: file.size, version: fileVersion(file)}, media.name || '')
    },
    async streamImage(db: ApiDb, req: Request, res: Response, mediaPath: string): Promise<void> {
      const parsed = parseNasMediaPath(mediaPath)
      if (!parsed || mediaFileKind(parsed.relativePath) !== 'image') throw new NasError('unsupported_format', 'Select a supported image file.', 415)
      const controller = new AbortController()
      const abort = () => controller.abort()
      res.once('close', abort)
      try {
        const row = mediaPath.includes('?v=') ? createMediaRepository(db.drizzle).findByPathVariants([mediaPath]) : null
        if (mediaPath.includes('?v=') && !row) throw new NasError('not_found', 'NAS image is unavailable.', 404)
        const plan = row ? await this.prepare(db, row.id, controller.signal)
          : await this.preparePreview(db, parsed.connectionId, parsed.relativePath, controller.signal)
        const sessionId = new URL(plan.url, 'http://localhost').searchParams.get('session')!
        try { await this.stream(db, req, res, row?.id ?? null, parsed.connectionId, sessionId) }
        finally { sessions.delete(sessionId) }
      } finally { res.removeListener('close', abort) }
    },
    async stream(db: ApiDb, req: Request, res: Response, mediaId: number | null, connectionId?: string, sessionId?: string) {
      const id = sessionId || (typeof req.query.session === 'string' ? req.query.session : '')
      const session = sessions.get(id)
      const media = mediaId == null ? null : createMediaRepository(db.drizzle).findById(mediaId)
      const location = session?.locationId ? db.drizzle.select().from(mediaLocations).where(eq(mediaLocations.id, session.locationId)).get() : null
      if (!session || session.mediaId !== mediaId || session.library !== libraryKey(db) || session.expires < Date.now()
        || (mediaId == null ? session.connectionId !== connectionId
          : !media || media.deletedAt || media.path !== session.mediaPath || !location || location.mediaId !== mediaId
            || location.connectionId !== session.connectionId || location.resourceKey !== session.path || location.version !== session.version)) {
        throw new NasError('expired_session', 'Playback session expired. Reconnect and retry.', 410)
      }
      const row = connectionRow(db, session.connectionId)
      const etag = `"${createHash('sha256').update(session.version).digest('hex')}"`
      // A stale If-Range validator requests the complete current representation.
      const range = parseNasRange(req.headers['if-range'] && req.headers['if-range'] !== etag ? undefined : req.headers.range, session.size)
      if (!range) { res.status(416).setHeader('Content-Range', `bytes */${session.size}`); res.end(); return }
      const controller = new AbortController()
      const untrack = track(session.connectionId, controller)
      const onClose = () => controller.abort()
      res.once('close', onClose)
      let transport: NasTransport | undefined
      let body: Awaited<ReturnType<NasTransport['read']>> | undefined
      let timer = setTimeout(() => controller.abort(), 30_000)
      const touch = () => {
        if (session.library !== libraryKey(db)) controller.abort()
        clearTimeout(timer); timer = setTimeout(() => controller.abort(), 30_000)
      }
      try {
        transport = await connect(NasConnectionSchema.parse(JSON.parse(row.config)), secrets.get(row.credentialRef), controller.signal)
        const file = await createNasSourceAdapter(transport).stat(session.path, controller.signal)
        if (fileVersion(file) !== session.version) throw new NasError('file_changed', 'The NAS file changed. Open the new version.', 409)
        if (session.library !== libraryKey(db) || !sessions.has(id)) throw new NasError('expired_session', 'Playback session expired.', 410)
        if (mediaId != null) {
          const active = createMediaRepository(db.drizzle).findById(mediaId)
          if (!active || active.deletedAt || active.path !== session.mediaPath) throw new NasError('not_found', 'NAS file was removed or changed.', 404)
        }
        res.status(range.partial ? 206 : 200)
        res.setHeader('Content-Type', mediaFileContentType(session.path) || 'application/octet-stream')
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('Accept-Ranges', 'bytes')
        res.setHeader('ETag', etag)
        res.setHeader('Cache-Control', 'no-store')
        if (req.query.download === '1') {
          res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(path.posix.basename(session.path))}`)
        }
        res.setHeader('Content-Length', range.end - range.start + 1)
        if (range.partial) res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${session.size}`)
        if (req.method === 'HEAD') { res.end(); return }
        const downloaded = await createNasSourceAdapter(transport).read(session.path, range.partial ? `bytes=${range.start}-${range.end}` : undefined, controller.signal)
        body = Buffer.isBuffer(downloaded.body) ? Readable.from([downloaded.body]) : downloaded.body
        const cancelBody = () => body?.destroy(new NasError('cancelled', 'Playback request cancelled.', 499))
        controller.signal.addEventListener('abort', cancelBody, {once: true})
        if (controller.signal.aborted) cancelBody()
        body.on('data', touch)
        await pipeline(body, res)
      } finally {
        clearTimeout(timer); untrack(); res.removeListener('close', onClose); controller.abort(); body?.destroy(); transport?.close()
      }
    },
  }
}
export type NasService = ReturnType<typeof createNasService>
