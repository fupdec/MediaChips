import {callbackReachesApi, localCloudCallback} from '../services/cloudOAuthCallback'
import {notifyCopySourceConnected} from '../services/mediaSources/copyDiscoveryTriggers'
import {pinSourceDb} from '../services/mediaSources/context'
import {offlinePlayback, sendOfflineFile} from '../services/mediaSources/offline'
import {createMediaRepository} from '../db/repositories/media'
import {driveMediaPath} from '../../shared/cloudDrive'
import type {Request, Response} from 'express'
import {sourceRetryAfter, sourceFailure, sourceRateLimited} from '../../shared/sourceErrors'
import {getCloudDriveService, resetCloudDriveService} from '../services/cloudDrive'
import {hasSavedDriveConfiguration, removeDriveConfiguration, saveDriveConfiguration, usesAutomaticDriveRedirect} from '../services/cloudDrive/config'
import {listDriveFolder, importDriveFile, driveLibraryFile} from '../services/cloudDrive/library'
import {DriveImportSchema, DriveFileIdSchema, isDriveMediaPath} from '../../shared/cloudDrive'
import {WebVideoFrameSchema} from '../../shared/webVideo'
import {saveWebVideoFrame} from '../services/webVideo/frames'
import type {ApiDb} from '../types/db'
import {z} from 'zod'
import {markCatalogSourceDisconnected} from '../services/mediaCatalogSources'
import {DEFAULT_DRIVE_CONNECTION_ID} from '../../shared/mediaSources'
import {checkOAuthClient, validateOAuthClient} from '../services/cloudDrive/oauth'
import {DriveOAuthError, driveOAuthErrorCode, driveOAuthErrorMessages, type DriveOAuthErrorCode} from '../services/cloudDrive/oauthErrors'
import {createCloudPlaybackSessions} from '../services/cloudPlayback'
import {createDriveSourceAdapter} from '../services/mediaSources/driveAdapter'
import {completeOAuth, oauthLaunchMode, oauthResultPage, parseOAuthReturnUrl, registerOAuthHandler, type OAuthCompletion} from '../services/oauthFlow'

function createCloudDriveController(db: ApiDb) {
  const playback = createCloudPlaybackSessions(db)
  const failure = (res: Response, err: unknown) => {
    const status = err instanceof z.ZodError ? 400 : err instanceof DriveOAuthError ? (err.code === 'network_error' ? 502 : 400) : (err as {status?: number; response?: {status?: number}})?.status || (err as {response?: {status?: number}})?.response?.status || 500
    if (sourceRateLimited(err)) { const delay = sourceRetryAfter(err); if (delay !== undefined) res.setHeader('Retry-After', delay); res.status(429).json({code: 'rate_limited', message: 'Google Drive request limit reached. Try again later.'}); return }
    const category = sourceFailure(err) || (driveOAuthErrorCode(err) === 'network_error' ? 'network_error' : undefined)
    if (category) {
      const messages = {network_error: 'Google Drive could not be reached. Check the server network.', permission_denied: 'This account does not have permission to read the Google Drive folder.', auth_required: 'Sign in to Google Drive again.'}
      res.status(category === 'network_error' ? 502 : category === 'permission_denied' ? 403 : 409).json({code: category, message: messages[category]})
      return
    }
    res.status(status === 401 ? 409 : status).json({code: driveOAuthErrorCode(err), message: err instanceof z.ZodError ? 'Invalid Google Drive request.' : err instanceof Error ? err.message : 'Google Drive request failed.'})
  }
  registerOAuthHandler({
    owns: state => getCloudDriveService().ownsOAuthState(state),
    async complete(state, code, error): Promise<OAuthCompletion> {
      const service = getCloudDriveService()
      if (error || !code) {
        const failed: DriveOAuthErrorCode = error === 'access_denied' ? 'access_denied' : 'unknown'
        service.consumeOAuthState(state, failed)
        return {ok: false, code: failed, message: driveOAuthErrorMessages[failed]}
      }
      try {
        const autoTarget = pinSourceDb(db)
        await service.handleOAuthCallback(code, state)
        try { autoTarget.assertCurrent(); notifyCopySourceConnected(autoTarget.db, DEFAULT_DRIVE_CONNECTION_ID) }
        catch { /* Authentication may finish after switching libraries. */ }
        return {ok: true}
      } catch (err) {
        const failed = driveOAuthErrorCode(err)
        console.warn('[drive] OAuth callback failed:', failed)
        return {ok: false, code: failed, message: driveOAuthErrorMessages[failed]}
      }
    },
  })
  const controller = {
    async status(req: Request, res: Response) {
      res.setHeader('Cache-Control', 'no-store')
      const service = getCloudDriveService()
      res.json({
        ...service.status(),
        hasSavedConfiguration: hasSavedDriveConfiguration(),
        automaticRedirectUri: usesAutomaticDriveRedirect(),
        suggestedRedirectUri: localCloudCallback(req.socket.localPort!, 'drive'),
        redirectUriMismatch: !callbackReachesApi(service.config.redirectUri, req.socket.localPort),
        oauthResult: typeof req.query.oauthState === 'string' ? service.oauthResult(req.query.oauthState) : undefined,
        oauthError: typeof req.query.oauthState === 'string' ? service.oauthError(req.query.oauthState) : undefined,
        approach: 'server-side-range-proxy',
        note: 'Remote library import and streaming; files remain on Google Drive.',
      })
    },

    async oauthStart(_req: Request, res: Response) {
      res.setHeader('Cache-Control', 'no-store')
      try {
        const service = getCloudDriveService()
        if (!callbackReachesApi(service.config.redirectUri, _req.socket.localPort)) throw new DriveOAuthError('redirect_uri_mismatch')
        if (!service.config.mock) await validateOAuthClient(service.config)
        if (service !== getCloudDriveService()) throw new DriveOAuthError('cancelled')
        const url = service.getAuthUrl()
        playback.invalidate()
        res.json({url, oauthState: new URL(url).searchParams.get('state'), redirectUri: service.config.redirectUri, scopes: service.config.scopes,
          mode: oauthLaunchMode(_req, service.config.redirectUri)})
      } catch (err: unknown) {
        res.status(400).json({code: driveOAuthErrorCode(err), message: err instanceof Error ? err.message : 'Google Drive sign-in failed.'})
      }
    },

    /** Shared Google callback: also finishes additional Google Drive accounts
     * that reuse this OAuth client, dispatched by state. */
    async oauthCallback(req: Request, res: Response) {
      res.setHeader('Cache-Control', 'no-store')
      const state = typeof req.query.state === 'string' ? req.query.state : ''
      const result = await completeOAuth(state, typeof req.query.code === 'string' ? req.query.code : undefined,
        typeof req.query.error === 'string' ? req.query.error : req.query.error ? 'unknown' : undefined)
      res.status(result.ok ? 200 : 400).type('html').send(oauthResultPage(result))
    },

    /** NAS/Docker: the browser cannot reach the API's 127.0.0.1 callback, so the
     * user pastes the address-bar URL of the failed redirect page instead. */
    async oauthComplete(req: Request, res: Response) {
      res.setHeader('Cache-Control', 'no-store')
      const parsed = parseOAuthReturnUrl((req.body as {url?: unknown} | undefined)?.url)
      if (!parsed) { res.status(400).json({code: 'invalid_oauth_url', message: 'Paste the full address from the browser address bar.'}); return }
      const result = await completeOAuth(parsed.state, parsed.code, parsed.error)
      if (result.ok) res.json({ok: true})
      else res.status(400).json({code: result.code, message: result.message})
    },

    async oauthHealth(_req: Request, res: Response) {
      res.setHeader('Cache-Control', 'no-store')
      res.json(await checkOAuthClient(getCloudDriveService().config))
    },

    async configure(req: Request, res: Response) {
      try {
        await saveDriveConfiguration(req.body, req.socket.localPort)
        playback.invalidate()
        resetCloudDriveService()
        await controller.status(req, res)
      } catch (err) { failure(res, err) }
    },

    async importFile(req: Request, res: Response) {
      try { res.json(await importDriveFile(db, getCloudDriveService(), DriveImportSchema.parse(req.body).fileId)) }
      catch (err) { failure(res, err) }
    },

    async playable(req: Request, res: Response) {
      try {
        const {row, fileId} = driveLibraryFile(db, z.coerce.number().int().positive().parse(req.params.id))
        const offline = offlinePlayback(db, row.id)
        if (offline) return res.json(offline)
        if (!getCloudDriveService().status().authenticated) return res.status(409).json({code: 'auth_required', message: 'Reconnect Google Drive in Settings → Sources.'})
        const session = await playback.prepare(row.id, () => createDriveSourceAdapter(getCloudDriveService().transport), AbortSignal.timeout(30_000))
        res.json({url: `/api/drive/files/${fileId}/stream?mediaId=${row.id}&session=${session}`, kind: 'mp4', title: row.name || row.basename,
          qualities: [], quality: null, adaptive: false})
      } catch (err) { failure(res, err) }
    },

    async frame(req: Request, res: Response) {
      try {
        await saveWebVideoFrame(db, z.coerce.number().int().positive().parse(req.params.id), WebVideoFrameSchema.parse(req.body), isDriveMediaPath)
        res.json({ok: true})
      } catch (err) { failure(res, err) }
    },

    async oauthCancel(req: Request, res: Response) {
      try {
        const state = z.object({oauthState: z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(req.body).oauthState
        getCloudDriveService().cancelOAuthState(state)
        res.json({ok: true})
      } catch (err) { failure(res, err) }
    },

    async removeConfiguration(req: Request, res: Response) {
      try {
        getCloudDriveService().logout()
        removeDriveConfiguration()
        resetCloudDriveService()
        playback.invalidate()
        markCatalogSourceDisconnected(db, DEFAULT_DRIVE_CONNECTION_ID)
        await controller.status(req, res)
      } catch (err) { failure(res, err) }
    },

    async logout(_req: Request, res: Response) {
      getCloudDriveService().logout()
      playback.invalidate()
      markCatalogSourceDisconnected(db, DEFAULT_DRIVE_CONNECTION_ID)
      res.json({ok: true})
    },

    async listFolder(req: Request, res: Response) {
      try {
        const service = getCloudDriveService()
        const folderId = String(req.params.folderId || 'root')
        const pageToken = typeof req.query.pageToken === 'string' ? req.query.pageToken : undefined
        const result = await listDriveFolder(db, service, folderId, pageToken)
        res.json(result)
      } catch (err: unknown) { failure(res, err) }
    },

    async stream(req: Request, res: Response) {
      try {
        if (req.query.session !== undefined || req.query.mediaId !== undefined) {
          await playback.stream(req, res, z.coerce.number().int().positive().parse(req.query.mediaId),
            z.string().uuid().parse(req.query.session), DriveFileIdSchema.parse(req.params.fileId))
          return
        }
        const service = getCloudDriveService()
        const cachedMedia = createMediaRepository(db.drizzle).findByPathVariants([driveMediaPath(DriveFileIdSchema.parse(req.params.fileId))])
        if (cachedMedia && !cachedMedia.deletedAt && offlinePlayback(db, cachedMedia.id)) { sendOfflineFile(db, cachedMedia.id, res); return }
        if (!service.config.mock && !service.store.get()?.accessToken) {
          return res.status(409).json({code: 'auth_required', message: 'Reconnect Google Drive in Settings → Sources.'})
        }
        const fileId = DriveFileIdSchema.parse(req.params.fileId)
        if (!fileId) {
          return res.status(400).json({message: 'Missing file id'})
        }
        await service.streamFile(req, res, service.transport, fileId)
      } catch (err: unknown) {
        console.error('Drive stream route error:', err)
        if (!res.headersSent) {
          failure(res, err)
        }
      }
    },
  }
  return controller
}

export default createCloudDriveController
