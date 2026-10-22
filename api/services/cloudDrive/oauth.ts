import axios from 'axios'
import type {DriveConfig, DriveOAuthTokens} from './types'
import type {DriveTokenStore} from './tokenStore'
import {DriveOAuthError, driveOAuthErrorCode, type DriveOAuthErrorCode} from './oauthErrors'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

/** Retry failures known to occur before a connection is established. Never
 * replay a real authorization code after a timeout/reset: Google may have used it. */
async function withOAuthConnectionRetry<T>(request: () => Promise<T>, harmlessProbe = false): Promise<T> {
  try { return await request() }
  catch (err) {
    const beforeConnection = axios.isAxiosError(err) && !err.response
      && ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH'].includes(err.code || '')
    const probeNetworkFailure = harmlessProbe && axios.isAxiosError(err) && !err.response
    if (!beforeConnection && !probeNetworkFailure) throw err
    await new Promise(resolve => setTimeout(resolve, 200))
    return request()
  }
}

export type DriveOAuthClientCheck = {reachable: boolean; valid: boolean; status?: number; code?: DriveOAuthErrorCode; networkCode?: string}

/** Check client authentication using a deliberately invalid refresh token.
 * Google returns invalid_grant for a valid client; no account tokens are issued. */
export async function checkOAuthClient(config: DriveConfig): Promise<DriveOAuthClientCheck> {
  if (!config.clientId || !config.clientSecret) return {reachable: true, valid: false, code: 'invalid_client'}
  try {
    const {data, status} = await withOAuthConnectionRetry(() => axios.post(GOOGLE_TOKEN_URL, new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: 'mediachips-invalid-refresh-token',
      client_id: config.clientId, client_secret: config.clientSecret,
    }).toString(), {headers: {'Content-Type': 'application/x-www-form-urlencoded'}, timeout: 8000,
      validateStatus: () => true, responseType: 'json'}), true)
    if (status === 400 && data?.error === 'invalid_grant') return {reachable: true, valid: true, status}
    if (data?.error === 'invalid_client' || status === 401) return {reachable: true, valid: false, status, code: 'invalid_client'}
    return {reachable: status < 500, valid: false, status, code: 'unknown'}
  } catch (err) {
    const networkCode = axios.isAxiosError(err) && /^[A-Z0-9_]{1,80}$/.test(err.code || '') ? err.code : undefined
    return {reachable: false, valid: false, code: driveOAuthErrorCode(err), networkCode}
  }
}

export async function validateOAuthClient(config: DriveConfig): Promise<void> {
  const result = await checkOAuthClient(config)
  if (!result.valid) throw new DriveOAuthError(result.code || 'unknown')
}

function buildAuthUrl(config: DriveConfig, state?: string, challenge?: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: config.scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  })
  if (challenge) { params.set('code_challenge', challenge); params.set('code_challenge_method', 'S256') }
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
  verifier?: string,
): Promise<DriveOAuthTokens> {
  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code',
  })
  if (verifier) body.set('code_verifier', verifier)
  const {data} = await withOAuthConnectionRetry(() => axios.post(GOOGLE_TOKEN_URL, body.toString(), {
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    timeout: 30_000,
  }))
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
  const {data} = await withOAuthConnectionRetry(() => axios.post(GOOGLE_TOKEN_URL, body.toString(), {
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    timeout: 30_000,
  }))
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
const refreshes = new WeakMap<DriveTokenStore, Promise<string>>()
async function getValidAccessToken(
  config: DriveConfig,
  store: DriveTokenStore,
): Promise<string> {
  const tokens = store.get()
  if (!tokens?.accessToken) {
    throw Object.assign(new Error('Sign in to Google Drive again.'), {code: 'auth_required', status: 409})
  }
  if (!isExpired(tokens)) return tokens.accessToken

  const existing = refreshes.get(store)
  if (existing) return existing
  const active = (async () => {
    try {
      const refreshed = await refreshAccessToken(config, tokens)
      if (store.get() !== tokens) throw new Error('Google Drive authorization changed. Try again.')
      store.set(refreshed)
      return refreshed.accessToken
    } catch (err) {
      if ((!tokens.refreshToken || driveOAuthErrorCode(err) === 'invalid_grant') && store.get() === tokens) {
        store.clear()
        throw Object.assign(new Error('Sign in to Google Drive again.'), {code: 'auth_required', status: 409})
      }
      throw err
    }
  })().finally(() => refreshes.delete(store))
  refreshes.set(store, active)
  return active
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
