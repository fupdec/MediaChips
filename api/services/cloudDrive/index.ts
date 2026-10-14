import {getDriveConfig} from './config'
import {randomBytes} from 'crypto'
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
        mock: config.mock,
        authenticated: config.mock ? true : Boolean(store.get()?.accessToken),
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
      for (const [key, outcome] of completed) if (outcome.expires < Date.now()) completed.delete(key)
      while (completed.size >= 20) completed.delete(completed.keys().next().value!)
      for (const [key, expires] of pending) if (expires < Date.now()) pending.delete(key)
      while (pending.size >= 20) pending.delete(pending.keys().next().value!)
      const state = randomBytes(32).toString('hex')
      pending.set(state, Date.now() + 10 * 60_000)
      return buildAuthUrl(config, state)
    },

    oauthResult(state) {
      if ((pending.get(state) || 0) > Date.now()) return 'waiting'
      const outcome = completed.get(state)
      return outcome && outcome.expires > Date.now() ? outcome.result : 'expired'
    },
    oauthError(state) { return completed.get(state)?.error },
    consumeOAuthState,
    cancelOAuthState(state) { pending.delete(state); completed.delete(state) },
    cancelOAuth() { authGeneration++; pending.clear(); completed.clear() },

    async handleOAuthCallback(code: string, state?: string) {
      if (!state || !consumeOAuthState(state)) throw new DriveOAuthError('expired')
      if (config.mock) {
        throw new Error('OAuth callback is disabled in mock mode')
      }
      const current = authGeneration
      completed.set(state, {result: 'waiting', expires: Date.now() + 10 * 60_000})
      try {
        const tokens = await exchangeCode(config, code)
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
      completed.clear()
      store.clear()
    },

    listFolder(folderId: string, pageToken?: string) {
      if (!config.mock && !store.get()?.accessToken) {
        return Promise.reject(Object.assign(new Error('Reconnect Google Drive in Settings → Connections.'), {status: 409}))
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
