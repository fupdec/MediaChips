import {sourceRetryAfter} from '../../../shared/sourceErrors'
import axios from 'axios'
import type {Readable} from 'stream'
import type {Request, Response} from 'express'
import {randomUUID} from 'crypto'
import {z} from 'zod'
import type {ApiDb} from '../../types/db'
import {createMediaRepository} from '../../db/repositories/media'
import {createMediaTypesRepository} from '../../db/repositories/mediaTypes'
import {createVideoMetadataRepository} from '../../db/repositories/videoMetadata'
import {isPublicWebHostname, normalizeWebVideoUrl} from '../../../shared/webVideo'
import {extractWebVideo} from './ytDlp'
import {publicHttpsAgent} from './network'
import {invalidateMediaDerivedCaches} from '../mediaCacheInvalidation'

const FormatSchema = z.object({
  url: z.string(), ext: z.string().optional(), protocol: z.string().optional(),
  height: z.number().nullable().optional(), width: z.number().nullable().optional(),
  vcodec: z.string().nullable().optional(), acodec: z.string().nullable().optional(),
  http_headers: z.record(z.string(), z.string()).optional(),
  manifest_url: z.string().optional(),
  has_drm: z.boolean().nullable().optional(),
})
const ExtractionSchema = z.object({
  thumbnail: z.string().nullish(),
  thumbnails: z.array(z.object({url: z.string()})).optional(),
  title: z.string(), duration: z.number().nullable().optional(),
  formats: z.array(FormatSchema), http_headers: z.record(z.string(), z.string()).optional(),
  _type: z.string().optional(),
})
const ExtractionEnvelopeSchema = z.object({
  _type: z.string().optional(), extractor: z.string().optional(), entries: z.array(z.unknown()).optional(),
})

export function validateStreamUrl(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.port || url.username || url.password
    || !isPublicWebHostname(url.hostname)) {
    throw new Error('Unsupported public HTTPS stream URL.')
  }
  return url.href
}

function unwrapSingleVideo(raw: unknown): unknown {
  // Generic HTML extraction wraps even a single <video>/iframe in a playlist.
  // yt-dlp requests two entries so a real collection cannot look like a single embed.
  for (let depth = 0; depth < 5; depth++) {
    const envelope = ExtractionEnvelopeSchema.parse(raw)
    if (!envelope._type || envelope._type === 'video') return raw
    if (envelope.extractor === 'generic' && envelope._type === 'playlist' && envelope.entries?.length === 1) {
      raw = envelope.entries[0]
      continue
    }
    break
  }
  throw new Error('Import a single video page, rather than a playlist or channel.')
}

export function parseExtraction(raw: unknown, pageUrl: string) {
  const data = ExtractionSchema.parse(unwrapSingleVideo(raw))
  const formats = data.formats.filter((format) => {
    try { validateStreamUrl(format.url) } catch { return false }
    return !format.has_drm && format.vcodec !== 'none' && format.acodec !== 'none'
      && (format.protocol?.startsWith('m3u8') || (format.ext === 'mp4' && (!format.protocol || format.protocol === 'https')))
  }).sort((a, b) => {
    const score = (f: typeof a) => (f.vcodec?.startsWith('avc') || f.vcodec?.startsWith('h264') ? 1_000_000 : 0)
      + (f.protocol?.startsWith('m3u8') ? 100_000 : 0) + (f.height || 0)
    return score(b) - score(a)
  })
  const format = formats[0]
  if (!format) throw new Error('No supported MP4/HLS video stream was found.')
  const streams = formats.map((item) => {
    const headers: Record<string, string> = {}
    for (const [key, value] of Object.entries({...data.http_headers, ...item.http_headers})) {
      if (['user-agent', 'origin', 'accept', 'accept-language', 'referer'].includes(key.toLowerCase())
        && !/[\r\n]/.test(value)) headers[key.toLowerCase()] = value
    }
    headers.referer ||= pageUrl
    let master: string | undefined
    if (item.protocol?.startsWith('m3u8') && item.manifest_url) {
      try { master = validateStreamUrl(item.manifest_url) } catch {}
    }
    return {url: item.url, kind: item.protocol?.startsWith('m3u8') ? 'hls' as const : 'mp4' as const,
      headers, width: item.width || 0, height: item.height || 0, master}
  })
  return {
    thumbnail: [data.thumbnail, ...(data.thumbnails || []).map(item => item.url).reverse()].find(url => {
      try { return !!url && !!validateStreamUrl(url) } catch { return false }
    }) || null,
    title: data.title.slice(0, 1000), duration: Math.max(0, data.duration || 0),
    ...streams[0], streams,
    qualities: [...new Set(streams.map((item) => item.height).filter((height) => height > 0))].sort((a, b) => b - a),
    quality: null as number | null, adaptive: false,
  }
}

type Extraction = ReturnType<typeof parseExtraction>
export function selectStreamQuality(source: Extraction, quality: number | null = null): Extraction {
  const selected = quality == null ? source.streams[0] : source.streams.find((item) => item.height === quality)
  if (!selected) throw new Error('This video quality is no longer available. Refresh the stream.')
  const adaptive = quality == null && Boolean(selected.master)
  return {...source, ...selected, url: adaptive ? selected.master! : selected.url, quality, adaptive}
}
type Session = {dbKey: string; mediaId: number; page: string; source: Extraction; resources: Map<string, string>; expires: number; started?: boolean}
const sessions = new Map<string, Session>()
type ExtractionCacheEntry = {expires: number; value: Promise<Extraction>; controller: AbortController; users: number; pending: boolean}
const cache = new Map<string, ExtractionCacheEntry>()
const databaseKeys = new WeakMap<object, string>()
function dbKey(db: ApiDb): string {
  let key = databaseKeys.get(db.sqlite)
  if (!key) { key = randomUUID(); databaseKeys.set(db.sqlite, key) }
  return `${db.path || db.config?.id || ''}:${key}`
}

async function resolve(db: ApiDb, page: string, fresh = false, signal?: AbortSignal): Promise<Extraction> {
  signal?.throwIfAborted()
  const key = `${dbKey(db)}:${page}`
  const previous = cache.get(key)
  let entry = !fresh && previous && previous.expires > Date.now() ? previous : undefined
  if (!entry) {
    if (cache.size >= 100) cache.delete(cache.keys().next().value!)
    const controller = new AbortController()
    const value = extractWebVideo(db, page, controller.signal).then((raw) => parseExtraction(raw, page))
    const created: ExtractionCacheEntry = {expires: Date.now() + 60_000, value, controller, users: 0, pending: true}
    created.value = value.then(source => {
      created.pending = false
      return source
    }, error => {
      created.pending = false
      if (cache.get(key) === created) cache.delete(key)
      throw error
    })
    entry = created
    cache.set(key, entry)
  }
  const current = entry
  current.users++
  let onAbort: (() => void) | undefined
  try {
    if (!signal) return await current.value
    return await new Promise<Extraction>((resolveValue, reject) => {
      onAbort = () => reject(signal.reason)
      signal.addEventListener('abort', onAbort, {once: true})
      current.value.then(resolveValue, reject)
    })
  } finally {
    if (onAbort) signal?.removeEventListener('abort', onAbort)
    current.users--
    // An import or another player may still need the same extraction.
    if (current.pending && current.users === 0) {
      if (cache.get(key) === current) cache.delete(key)
      current.controller.abort()
    }
  }
}

export async function importWebVideo(db: ApiDb, input: string) {
  const library = dbKey(db)
  const page = normalizeWebVideoUrl(input)
  if (!page) throw new Error('Invalid public HTTPS video page URL.')
  const repo = createMediaRepository(db.drizzle)
  const existing = repo.findByPathVariants([page])
  if (existing) {
    if (existing.deletedAt) throw new Error('This video is in Trash. Restore it before importing again.')
    return {id: existing.id, title: existing.name || '', created: false}
  }
  const source = await resolve(db, page)
  if (dbKey(db) !== library) throw new Error('The active library changed. Import the link again.')
  const mediaType = createMediaTypesRepository(db.drizzle).findByType('video')
  if (!mediaType) throw new Error('Video media type is not configured.')
  const result = db.drizzle.transaction(() => {
    const item = repo.findOrCreateByPath(page, {
      name: source.title, basename: source.title, ext: 'mp4', mediaTypeId: mediaType.id,
    })
    if (item.created) createVideoMetadataRepository(db.drizzle).create({
      mediaId: item.row.id, duration: Math.round(source.duration), width: source.width,
      height: source.height,
    })
    return {id: item.row.id, title: source.title, created: item.created}
  })
  invalidateMediaDerivedCaches()
  return result
}

export async function resolveWebVideoThumbnail(db: ApiDb, mediaId: number, signal?: AbortSignal): Promise<Buffer | null> {
  const page = findPage(db, mediaId)
  const source = await resolve(db, page, false, signal)
  if (!source.thumbnail) return null
  const {downloadRemoteThumbnail} = await import('../remoteThumbnailDownload')
  return downloadRemoteThumbnail(source.thumbnail, signal, source.headers)
}

function findPage(db: ApiDb, id: number): string {
  const media = createMediaRepository(db.drizzle).findById(id)
  const page = media && !media.deletedAt && normalizeWebVideoUrl(media.path)
  if (!page) throw new Error('Web video not found in the active library.')
  return page
}

export async function prepareWebVideo(db: ApiDb, mediaId: number, options: {quality?: number | null; fresh?: boolean; signal?: AbortSignal} = {}) {
  const library = dbKey(db)
  const page = findPage(db, mediaId)
  const source = selectStreamQuality(await resolve(db, page, options.fresh, options.signal), options.quality ?? null)
  options.signal?.throwIfAborted()
  if (dbKey(db) !== library || findPage(db, mediaId) !== page) throw new Error('The active library changed. Open the video again.')
  for (const [id, session] of sessions) if (session.expires < Date.now()) sessions.delete(id)
  if (sessions.size >= 100) sessions.delete(sessions.keys().next().value!)
  const sessionId = randomUUID()
  sessions.set(sessionId, {dbKey: dbKey(db), mediaId, page, source,
    resources: new Map([['root', source.url]]), expires: Date.now() + 6 * 60 * 60_000})
  return {url: `/api/web-video/${mediaId}/stream?session=${sessionId}&resource=root`,
    kind: source.kind, title: source.title, qualities: source.qualities, quality: source.quality, adaptive: source.adaptive}
}

export function rewriteHlsManifest(text: string, base: string, register: (url: string) => string): string {
  if (!text.trimStart().startsWith('#EXTM3U')) throw new Error('Invalid HLS manifest.')
  const replace = (uri: string) => register(validateStreamUrl(new URL(uri, base).href))
  return text.split(/\r?\n/).map((line) => {
    if (line.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_match, uri: string) => `URI="${replace(uri)}"`)
    return line.trim() ? replace(line.trim()) : line
  }).join('\n')
}

async function requestStream(url: string, headers: Record<string, string>, signal: AbortSignal) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await axios.get<Readable>(validateStreamUrl(url), {
      headers, signal, responseType: 'stream', maxRedirects: 0, timeout: 30_000,
      httpsAgent: publicHttpsAgent, proxy: false,
      validateStatus: () => true,
    })
    if (response.status >= 300 && response.status < 400 && response.headers.location) {
      response.data.destroy()
      url = validateStreamUrl(new URL(response.headers.location, url).href)
      continue
    }
    return {response, url}
  }
  throw new Error('Too many upstream redirects.')
}

export async function streamWebVideo(db: ApiDb, req: Request, res: Response, mediaId: number): Promise<void> {
  const sessionId = typeof req.query.session === 'string' ? req.query.session : ''
  const resourceId = typeof req.query.resource === 'string' ? req.query.resource : 'root'
  const session = sessions.get(sessionId)
  if (!session || session.mediaId !== mediaId || session.dbKey !== dbKey(db)
    || session.expires < Date.now() || findPage(db, mediaId) !== session.page) {
    res.status(410).json({code: 'session_expired', message: 'Playback session expired. Open the video again.'})
    return
  }
  const remote = session.resources.get(resourceId)
  if (!remote) { res.status(404).end(); return }
  const abort = new AbortController()
  const onClose = () => abort.abort()
  res.on('close', onClose)
  let body: Readable | undefined
  try {
    const headers = {...session.source.headers}
    if (req.headers.range) headers.Range = req.headers.range
    let upstream = await requestStream(remote, headers, abort.signal)
    if (resourceId === 'root' && [401, 403, 410].includes(upstream.response.status)) {
      upstream.response.data.destroy()
      session.source = selectStreamQuality(await resolve(db, session.page, true, abort.signal), session.source.quality)
      session.resources.set('root', session.source.url)
      upstream = await requestStream(session.source.url, {...session.source.headers, ...(req.headers.range ? {Range: req.headers.range} : {})}, abort.signal)
    }
    // HTML players can advertise a stale <source> before a working mirror.
    // Select a mirror before publishing bytes; never splice MP4 encodings after
    // the player has already read an index or started requesting seek ranges.
    if (resourceId === 'root' && session.source.kind === 'mp4' && !session.started && upstream.response.status === 404) {
      const alternatives = session.source.streams.filter(item => item.kind === 'mp4'
        && item.url !== session.source.url && item.width === session.source.width && item.height === session.source.height).slice(0, 3)
      for (const alternative of alternatives) {
        if (session.started || upstream.response.status !== 404) break
        upstream.response.data.destroy()
        upstream = await requestStream(alternative.url, {...alternative.headers, ...(req.headers.range ? {Range: req.headers.range} : {})}, abort.signal)
        if ([200, 206].includes(upstream.response.status)) {
          session.source = {...session.source, ...alternative}
          session.resources.set('root', alternative.url)
        }
      }
    }
    const {response, url} = upstream
    body = response.data
    if (![200, 206].includes(response.status)) {
      body.destroy()
      const status = [403, 404, 410, 416, 429].includes(response.status) ? response.status : 502
      const delay = status === 429 ? sourceRetryAfter({response}) : undefined
      if (delay !== undefined) res.setHeader('Retry-After', delay)
      res.status(status).json({code: status === 429 ? 'rate_limited' : status === 410 ? 'session_expired' : status === 403 ? 'permission_denied' : status === 404 ? 'not_found' : 'network_error', message: 'The remote video stream is unavailable.'})
      return
    }
    res.setHeader('Cache-Control', 'no-store')
    const type = String(response.headers['content-type'] || '')
    const manifest = /mpegurl/i.test(type) || /\.m3u8(?:\?|$)/i.test(url)
      || (resourceId === 'root' && session.source.kind === 'hls')
    if (manifest) {
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of body) {
        size += chunk.length
        if (size > 2 * 1024 * 1024) throw new Error('HLS manifest is too large.')
        chunks.push(Buffer.from(chunk))
      }
      const auth = typeof req.query.token === 'string' ? req.query.token : ''
      const text = rewriteHlsManifest(Buffer.concat(chunks).toString('utf8'), url, (uri) => {
        let id = Array.from(session.resources).find(([, value]) => value === uri)?.[0]
        if (!id) {
          if (session.resources.size > 10_000) throw new Error('Too many HLS resources.')
          id = randomUUID()
          session.resources.set(id, uri)
        }
        const params = new URLSearchParams({session: sessionId, resource: id})
        if (auth) params.set('token', auth)
        return `/api/web-video/${mediaId}/stream?${params}`
      })
      res.type('application/vnd.apple.mpegurl').send(text)
      return
    }
    res.status(response.status)
    if (resourceId === 'root') session.started = true
    res.setHeader('Content-Type', resourceId === 'root' ? 'video/mp4' : (type || 'application/octet-stream'))
    for (const name of ['content-length', 'content-range', 'accept-ranges']) {
      if (response.headers[name]) res.setHeader(name, String(response.headers[name]))
    }
    await new Promise<void>((resolvePipe, reject) => {
      body!.on('error', reject)
      res.once('finish', resolvePipe)
      res.once('close', resolvePipe)
      body!.pipe(res)
    })
  } finally {
    body?.destroy()
    res.off('close', onClose)
    abort.abort()
  }
}
