import axios from 'axios'
import type {DriveConfig, DriveOAuthTokens} from './types'
import type {DriveTokenStore} from './tokenStore'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

function buildAuthUrl(config: DriveConfig, state?: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: config.scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  })
  if (state) params.set('state', state)
  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

function mapTokenResponse(data: {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  scope?: string
}, previous?: DriveOAuthTokens | null): DriveOAuthTokens {
  const expiryDate = typeof data.expires_in === 'number'
    ? Date.now() + data.expires_in * 1000
    : previous?.expiryDate
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || previous?.refreshToken,
    expiryDate,
    tokenType: data.token_type || previous?.tokenType || 'Bearer',
    scope: data.scope || previous?.scope,
  }
}

async function exchangeCode(
  config: DriveConfig,
  code: string,
): Promise<DriveOAuthTokens> {
  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code',
  })
  const {data} = await axios.post(GOOGLE_TOKEN_URL, body.toString(), {
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    timeout: 30_000,
  })
  return mapTokenResponse(data)
}

async function refreshAccessToken(
  config: DriveConfig,
  tokens: DriveOAuthTokens,
): Promise<DriveOAuthTokens> {
  if (!tokens.refreshToken) {
    throw new Error('No refresh token available; re-authorize Google Drive')
  }
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: tokens.refreshToken,
    grant_type: 'refresh_token',
  })
  const {data} = await axios.post(GOOGLE_TOKEN_URL, body.toString(), {
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    timeout: 30_000,
  })
  return mapTokenResponse(data, tokens)
}

function isExpired(tokens: DriveOAuthTokens, skewMs = 60_000): boolean {
  if (!tokens.expiryDate) return false
  return Date.now() >= tokens.expiryDate - skewMs
}

/**
 * Returns a valid access token, refreshing when needed.
 * OAuth lives in the API process — never expose client secret to the renderer.
 */
async function getValidAccessToken(
  config: DriveConfig,
  store: DriveTokenStore,
): Promise<string> {
  const tokens = store.get()
  if (!tokens?.accessToken) {
    throw new Error('Not authenticated with Google Drive')
  }
  if (!isExpired(tokens)) return tokens.accessToken

  const refreshed = await refreshAccessToken(config, tokens)
  store.set(refreshed)
  return refreshed.accessToken
}

export {
  buildAuthUrl,
  exchangeCode,
  refreshAccessToken,
  getValidAccessToken,
  isExpired,
  GOOGLE_AUTH_URL,
  GOOGLE_TOKEN_URL,
}
