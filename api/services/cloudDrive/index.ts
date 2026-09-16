import {getDriveConfig} from './config'
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
  }
  getAuthUrl(state?: string): string
  handleOAuthCallback(code: string): Promise<void>
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
      }
    },

    getAuthUrl(state?: string) {
      if (config.mock) {
        throw new Error('Drive is in mock mode; set GOOGLE_OAUTH_CLIENT_ID/SECRET and unset MEDIA_CHIPS_DRIVE_MOCK')
      }
      if (!config.clientId || !config.clientSecret) {
        throw new Error('Google OAuth client id/secret not configured')
      }
      return buildAuthUrl(config, state)
    },

    async handleOAuthCallback(code: string) {
      if (config.mock) {
        throw new Error('OAuth callback is disabled in mock mode')
      }
      const tokens = await exchangeCode(config, code)
      store.set(tokens)
    },

    logout() {
      store.clear()
    },

    listFolder(folderId: string, pageToken?: string) {
      if (!config.mock && !store.get()?.accessToken) {
        return Promise.reject(Object.assign(new Error('Not authenticated with Google Drive'), {status: 401}))
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

/** Test helper to reset singleton between cases. */
function resetCloudDriveServiceForTests(): void {
  shared = null
}

export {
  createCloudDriveService,
  getCloudDriveService,
  resetCloudDriveServiceForTests,
  getDriveConfig,
  createTokenStore,
  createMockDriveTransport,
  createGoogleDriveTransport,
  streamDriveFile,
  buildAuthUrl,
  exchangeCode,
}
