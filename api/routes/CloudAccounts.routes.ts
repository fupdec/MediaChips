import {sourceRetryAfter} from '../../shared/sourceErrors'
import {localCloudCallback, callbackReachesApi} from '../services/cloudOAuthCallback'
import {readCloudMediaMetadata} from '../services/cloudAccounts/libraryMetadata'
import {isCloudMetadataPath} from '../services/cloudAccounts/metadataBackfill'
import {markCatalogSourceDisconnected} from '../services/mediaCatalogSources'
import express, {type Express, type Request, type Response} from 'express'
import {pipeline} from 'stream/promises'
import {z} from 'zod'
import type {ApiDb} from '../types/db'
import {getCloudAccounts} from '../services/cloudAccounts/accounts'
import {importCloudFile} from '../services/cloudAccounts/library'
import {CloudAccountInputSchema, CloudProviderSchema, CloudKeySchema, isCloudMediaPath} from '../../shared/cloudAccounts'
import {resolveMediaLocation} from '../services/mediaSources/locations'
import {pinSourceDb} from '../services/mediaSources/context'
import {offlinePlayback} from '../services/mediaSources/offline'
import {saveWebVideoFrame} from '../services/webVideo/frames'
import {WebVideoFrameSchema} from '../../shared/webVideo'
import {createCloudPlaybackSessions} from '../services/cloudPlayback'

export default function registerCloudAccounts(app: Express, db: ApiDb) {
  const accounts = getCloudAccounts(), router = express.Router()
  const playback = createCloudPlaybackSessions(db)
  const route = (handler: (req: Request, res: Response) => unknown) => async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'private, no-store')
    try { await handler(req, res) } catch (err) {
      if (res.headersSent) { res.destroy(); return }
      const status = err instanceof z.ZodError ? 400 : (err as {status?: number})?.status || 502
      const retryAfter = status === 429 ? sourceRetryAfter(err) : undefined
      if (retryAfter !== undefined) res.setHeader('Retry-After', retryAfter)
      res.status(status).json({code: (err as {code?: string})?.code || 'cloud_request_failed', message: err instanceof z.ZodError ? 'Invalid cloud request.' : 'Cloud request failed. Check the account connection.'})
    }
  }
  const id = (req: Request) => z.string().uuid().parse(req.params.id)
  const mediaId = (req: Request) => z.coerce.number().int().positive().parse(req.params.mediaId)
  const resolve = (req: Request) => {
    const resolved = resolveMediaLocation(db, mediaId(req))
    if (resolved.provider === 'local' || !isCloudMediaPath(resolved.card.path)) throw Object.assign(new Error('media_not_found'), {status: 404})
    return resolved
  }
  const stream = async (req: Request, res: Response, connectionId: string, key: string) => {
    const controller = new AbortController(), pinned = pinSourceDb(db)
    const abort = () => controller.abort()
    res.once('close', abort)
    const adapter = accounts.adapter(pinned.db, connectionId)
    try {
      const file = await adapter.stat(key, controller.signal)
      if (file.isDirectory || !/^(video\/|audio\/|image\/(jpeg|png|gif|webp|avif|bmp)$)/.test(file.contentType)) throw Object.assign(new Error('unsupported_media'), {status: 415})
      const result = await adapter.read(key, req.headers.range, controller.signal)
      pinned.assertCurrent()
      res.status(result.status).set({'Content-Type': file.contentType, 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes'})
      for (const header of ['content-length', 'content-range']) if (result.headers[header]) res.setHeader(header, result.headers[header]!)
      if (Buffer.isBuffer(result.body)) res.end(result.body)
      else await pipeline(result.body, res)
    } finally { res.removeListener('close', abort); controller.abort(); adapter.close() }
  }
  router.post('/metadata/snapshot', route((req, res) => {
    const {ids} = z.object({ids: z.array(z.number().int().positive()).min(1).max(64)}).strict().parse(req.body)
    const current = pinSourceDb(db).db
    const items = [...new Set(ids)].map(id => readCloudMediaMetadata(current, id))
      .filter(item => item && isCloudMetadataPath(item.path))
    res.json({items})
  }))
  const managedProviders = {gdrive: ['GOOGLE', 'Google Drive'], onedrive: ['ONEDRIVE', 'OneDrive'], dropbox: ['DROPBOX', 'Dropbox']} as const
  function managedInput(provider: keyof typeof managedProviders, port: number | undefined) {
    const [prefix, name] = managedProviders[provider]
    const clientId = process.env[`MEDIA_CHIPS_CLOUD_${prefix}_CLIENT_ID`]?.trim()
    const clientSecret = process.env[`MEDIA_CHIPS_CLOUD_${prefix}_CLIENT_SECRET`]?.trim()
    const redirectUri = process.env.MEDIA_CHIPS_CLOUD_REDIRECT_URI?.trim()
    if (!clientId || !clientSecret || !redirectUri) return
    const parsed = CloudAccountInputSchema.safeParse({provider, name, clientId, clientSecret, redirectUri})
    if (parsed.success && callbackReachesApi(redirectUri, port)) return parsed.data
  }
  router.get('/configuration', route((req, res) => {
    const managed = CloudProviderSchema.options.filter(provider => managedInput(provider, req.socket.localPort))
    res.json({redirectUri: localCloudCallback(req.socket.localPort!, 'cloud-accounts'), mode: 'local-credentials', managed})
  }))
  router.post('/managed', route((req, res) => {
    const {provider} = z.object({provider: CloudProviderSchema}).strict().parse(req.body)
    const input = managedInput(provider, req.socket.localPort)
    if (!input) throw Object.assign(new Error('Cloud provider is not configured on this server.'), {code: 'managed_oauth_unavailable', status: 409})
    res.status(201).json(accounts.create(db, input))
  }))
  router.get('/', route((_req, res) => { res.json(accounts.list(db)) }))
  router.post('/', route((req, res) => { res.status(201).json(accounts.create(db, req.body)) }))
  router.put('/:id/configuration', route((req, res) => { const account = accounts.configure(db, id(req), req.body); playback.invalidate(id(req)); res.json(account) }))
  router.post('/:id/oauth/start', route((req, res) => {
    const account = accounts.list(db).find(a => a.id === id(req))
    if (account && !callbackReachesApi(account.redirectUri, req.socket.localPort)) throw Object.assign(new Error('redirect_uri_mismatch'), {code: 'redirect_uri_mismatch', status: 400})
    const started = accounts.start(db, id(req)); playback.invalidate(id(req)); res.json(started) }))
  router.get('/:id/oauth/status', route((req, res) => { res.json({result: accounts.result(db, id(req), z.string().regex(/^[a-f0-9]{64}$/).parse(req.query.state))}) }))
  router.post('/:id/oauth/cancel', route((req, res) => { accounts.cancel(db, id(req)); res.json({ok: true}) }))
  router.get('/oauth/callback', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    try {
      await accounts.callback(z.string().regex(/^[a-f0-9]{64}$/).parse(req.query.state), typeof req.query.code === 'string' ? req.query.code : undefined, !!req.query.error)
      res.type('html').send('<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><p>Облачный аккаунт подключён. Cloud account connected. Можно закрыть окно.</p>')
    } catch { res.status(400).type('text').send('Authorization failed or expired. Start sign-in again in MediaChips.') }
  })
  router.delete('/:id', route((req, res) => {
    const accountId = id(req)
    accounts.remove(db, accountId)
    playback.invalidate(accountId)
    markCatalogSourceDisconnected(db, accountId)
    res.json({ok: true})
  }))
  router.post('/:id/logout', route((req, res) => { accounts.logout(db, id(req)); playback.invalidate(id(req)); markCatalogSourceDisconnected(db, id(req)); res.json({ok: true}) }))
  router.get('/:id/files', route(async (req, res) => {
    const pinned = pinSourceDb(db), adapter = accounts.adapter(pinned.db, id(req))
    try {
      const page = await adapter.list(CloudKeySchema.parse(req.query.key || 'root'), z.string().max(8192).optional().parse(req.query.pageToken), AbortSignal.timeout(30_000))
      pinned.assertCurrent(); res.json(page)
    } finally { adapter.close() }
  }))
  router.get('/:id/metadata', route(async (req, res) => {
    const adapter = accounts.adapter(db, id(req))
    try { res.json(await adapter.stat(CloudKeySchema.parse(req.query.key), AbortSignal.timeout(30_000))) } finally { adapter.close() }
  }))
  router.post('/:id/import', route(async (req, res) => {
    const key = z.object({key: CloudKeySchema}).strict().parse(req.body).key
    const adapter = accounts.adapter(db, id(req))
    try { res.json(await importCloudFile(db, id(req), key, adapter, AbortSignal.timeout(30_000))) } finally { adapter.close() }
  }))
  router.get('/:id/stream', route((req, res) => stream(req, res, id(req), CloudKeySchema.parse(req.query.key))))
  router.get('/media/:mediaId/playable', route(async (req, res) => {
    const resolved = resolve(req), offline = offlinePlayback(db, mediaId(req))
    if (offline) { res.json(offline); return }
    const session = await playback.prepare(mediaId(req), (pinned, connectionId) => accounts.adapter(pinned, connectionId), AbortSignal.timeout(30_000))
    res.json({url: `/api/cloud-accounts/media/${mediaId(req)}/stream?session=${session}`, kind: 'mp4', title: resolved.card.name || '', qualities: [], quality: null, adaptive: false})
  }))
  router.get('/media/:mediaId/stream', route((req, res) => {
    return playback.stream(req, res, mediaId(req), z.string().uuid().parse(req.query.session))
  }))
  router.post('/media/:mediaId/frame', route(async (req, res) => { await saveWebVideoFrame(db, mediaId(req), WebVideoFrameSchema.parse(req.body), isCloudMediaPath); res.json({ok: true}) }))
  app.use('/api/cloud-accounts', router)
}
