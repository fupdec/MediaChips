import {READ_SOURCE_CAPABILITIES, NAS_SOURCE_CAPABILITIES, type SourceCapabilities} from '../../../shared/mediaSources'
import {getDriveConfig} from './config'
import {randomBytes, createHash} from 'crypto'
import {DriveOAuthError, driveOAuthErrorCode, type DriveOAuthErrorCode} from './oauthErrors'
import {createTokenStore, type DriveTokenStore} from './tokenStore'
import {buildAuthUrl, exchangeCode} from './oauth'
import {createGoogleDriveTransport} from './driveClient'
import {createMockDriveTransport} from './mockTransport'
import {streamDriveFile} from './streamDriveFile'
import type {DriveConfig, DriveTransport} from './types'

export type CloudDriveService = {
  config: DriveConfig
  store: DriveTokenStore
  transport: DriveTransport
  status(): {
    configured: boolean
    capabilities: SourceCapabilities
    mock: boolean
    authenticated: boolean
    redirectUri: string
    scopes: string[]
    hasClientId: boolean
    clientId: string
  }
  getAuthUrl(): string
  handleOAuthCallback(code: string, state?: string): Promise<void>
  oauthResult(state: string): 'waiting' | 'connected' | 'failed' | 'expired'
  oauthError(state: string): DriveOAuthErrorCode | undefined
  cancelOAuthState(state: string): void
  cancelOAuth(): void
  consumeOAuthState(state: string, error?: DriveOAuthErrorCode): boolean
  ownsOAuthState(state: string): boolean
  logout(): void
  listFolder(folderId: string, pageToken?: string): ReturnType<DriveTransport['listFolder']>
  streamFile: typeof streamDriveFile
}

function createCloudDriveService(options?: {
  config?: DriveConfig
  store?: DriveTokenStore
  transport?: DriveTransport
}): CloudDriveService {
  const config = options?.config ?? getDriveConfig()
  const store = options?.store ?? createTokenStore(config.tokenStorePath)
  const transport =
    options?.transport ??
    (config.mock ? createMockDriveTransport() : createGoogleDriveTransport(config, store))

  let authGeneration = 0
  const completed = new Map<string, {result: 'waiting' | 'connected' | 'failed'; expires: number; error?: DriveOAuthErrorCode}>()
  const pending = new Map<string, number>()
  const verifiers = new Map<string, string>()
  const consumeOAuthState = (state: string, error: DriveOAuthErrorCode = 'unknown') => {
    const expires = pending.get(state)
    pending.delete(state)
    if (expires && expires > Date.now()) {
      completed.set(state, {result: 'failed', expires, error})
      return true
    }
    return false
  }

  return {
    config,
    store,
    transport,

    status() {
      return {
        configured: config.configured,
        capabilities: config.mock || store.get()?.scope?.split(/\s+/).includes('https://www.googleapis.com/auth/drive') ? NAS_SOURCE_CAPABILITIES : READ_SOURCE_CAPABILITIES,
        mock: config.mock,
        authenticated: config.mock ? true : Boolean(store.get()?.accessToken && (!store.get()?.expiryDate || store.get()!.expiryDate! > Date.now() || store.get()?.refreshToken)),
        redirectUri: config.redirectUri,
        scopes: config.scopes,
        hasClientId: Boolean(config.clientId),
        clientId: config.clientId,
      }
    },

    getAuthUrl() {
      if (config.mock) {
        throw new Error('Drive is in mock mode; set GOOGLE_OAUTH_CLIENT_ID/SECRET and unset MEDIA_CHIPS_DRIVE_MOCK')
      }
      if (!config.clientId || !config.clientSecret) {
        throw new Error('Google OAuth client id/secret not configured')
      }
      authGeneration++; pending.clear(); verifiers.clear(); completed.clear()
      const state = randomBytes(32).toString('hex')
      pending.set(state, Date.now() + 10 * 60_000)
      const verifier = randomBytes(48).toString('base64url')
      verifiers.set(state, verifier)
      return buildAuthUrl(config, state, createHash('sha256').update(verifier).digest('base64url'))
    },

    oauthResult(state) {
      if ((pending.get(state) || 0) > Date.now()) return 'waiting'
      const outcome = completed.get(state)
      return outcome && outcome.expires > Date.now() ? outcome.result : 'expired'
    },
    oauthError(state) { return completed.get(state)?.error },
    consumeOAuthState,
    ownsOAuthState(state) { return (pending.get(state) || 0) > Date.now() },
    cancelOAuthState(state) { pending.delete(state); verifiers.delete(state); completed.delete(state) },
    cancelOAuth() { authGeneration++; pending.clear(); verifiers.clear(); completed.clear() },

    async handleOAuthCallback(code: string, state?: string) {
      if (!state || !consumeOAuthState(state)) throw new DriveOAuthError('expired')
      if (config.mock) {
        throw new Error('OAuth callback is disabled in mock mode')
      }
      const current = authGeneration
      completed.set(state, {result: 'waiting', expires: Date.now() + 10 * 60_000})
      try {
        const verifier = verifiers.get(state)
        verifiers.delete(state)
        const tokens = await exchangeCode(config, code, verifier)
        if (current !== authGeneration || !completed.has(state)) throw new DriveOAuthError('cancelled')
        store.set(tokens)
        completed.set(state, {result: 'connected', expires: Date.now() + 10 * 60_000})
      } catch (err) {
        if (current === authGeneration && completed.has(state)) completed.set(state, {result: 'failed', expires: Date.now() + 10 * 60_000, error: driveOAuthErrorCode(err)})
        throw err
      }
    },

    logout() {
      authGeneration++
      pending.clear()
      verifiers.clear()
      completed.clear()
      store.clear()
    },

    listFolder(folderId: string, pageToken?: string) {
      if (!config.mock && !store.get()?.accessToken) {
        return Promise.reject(Object.assign(new Error('Reconnect Google Drive in Settings → Sources.'), {code: 'auth_required', status: 409}))
      }
      return transport.listFolder(folderId || 'root', pageToken)
    },

    streamFile(req, res, _transport, fileId, fallbackContentType) {
      return streamDriveFile(req, res, transport, fileId, fallbackContentType)
    },
  }
}

/** Process-wide singleton for route handlers (lazy). */
let shared: CloudDriveService | null = null

function getCloudDriveService(): CloudDriveService {
  if (!shared) shared = createCloudDriveService()
  return shared
}

/** Reload connection settings and discard pending authorizations. */
function resetCloudDriveService(): void {
  shared?.cancelOAuth()
  shared = null
}

export {
  createCloudDriveService,
  getCloudDriveService,
  resetCloudDriveService,
  resetCloudDriveService as resetCloudDriveServiceForTests,
  getDriveConfig,
  createTokenStore,
  createMockDriveTransport,
  createGoogleDriveTransport,
  streamDriveFile,
  buildAuthUrl,
  exchangeCode,
}
