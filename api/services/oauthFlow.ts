import type {Request} from 'express'

/**
 * Server-owned OAuth flow shared by every cloud provider. The backend decides
 * how sign-in returns, so Electron, a local browser and a remote browser
 * (NAS/Docker) all follow the same rules without client-side guessing.
 */
export type OAuthLaunchMode = 'callback' | 'paste'
export type OAuthCompletion = {ok: true} | {ok: false; code: string; message: string}
type OAuthHandler = {
  owns(state: string): boolean
  complete(state: string, code: string | undefined, error: string | undefined): Promise<OAuthCompletion>
}

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]']
const STATE_PATTERN = /^[a-f0-9]{64}$/
const handlers: OAuthHandler[] = []

function isLoopbackAddress(address: string | undefined) {
  if (!address) return false
  const value = address.replace(/^::ffff:/, '')
  return value === '127.0.0.1' || value === '::1' || value.startsWith('127.')
}

/** Loopback callbacks open only in a browser running on the API machine. A
 * request from another address (LAN, Docker bridge, reverse proxy) gets the
 * paste fallback; public callbacks always return directly. */
export function oauthLaunchMode(req: Request, redirectUri: string): OAuthLaunchMode {
  let host = ''
  try { host = new URL(redirectUri).hostname } catch { return 'paste' }
  if (!LOOPBACK_HOSTS.includes(host)) return 'callback'
  const forwarded = req.headers['x-forwarded-for']
  const forwardedFrom = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim()
  if (forwardedFrom && !isLoopbackAddress(forwardedFrom)) return 'paste'
  return isLoopbackAddress(req.socket.remoteAddress) ? 'callback' : 'paste'
}

/** Parse the address-bar URL of the redirect page a remote browser could not open. */
export function parseOAuthReturnUrl(raw: unknown): {state: string; code?: string; error?: string} | null {
  if (typeof raw !== 'string' || raw.length > 8192) return null
  let params: URLSearchParams
  try { params = new URL(raw.trim()).searchParams } catch { return null }
  const state = params.get('state') || ''
  if (!STATE_PATTERN.test(state)) return null
  return {state, code: params.get('code') || undefined, error: params.get('error') || undefined}
}

export function registerOAuthHandler(handler: OAuthHandler) {
  handlers.push(handler)
  return () => { const index = handlers.indexOf(handler); if (index >= 0) handlers.splice(index, 1) }
}

/** Finish any pending sign-in by its state, whichever provider started it. */
export async function completeOAuth(state: string, code: string | undefined, error: string | undefined): Promise<OAuthCompletion> {
  const handler = STATE_PATTERN.test(state) ? handlers.find(item => item.owns(state)) : undefined
  if (!handler) return {ok: false, code: 'expired', message: 'The sign-in session expired or the server restarted. Start sign-in again. / Сеанс входа истёк или сервер перезапустился. Начните вход заново.'}
  return handler.complete(state, code, error)
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]!))
export function oauthResultPage(result: OAuthCompletion) {
  const text = result.ok ? 'Account connected. You can close this window. / Аккаунт подключён. Можно закрыть это окно.' : result.message
  return `<!doctype html><html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MediaChips</title>`
    + `<body style="font:15px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;box-sizing:border-box;text-align:center">`
    + `<p>${escapeHtml(text)}</p>${result.ok ? '<script>setTimeout(() => window.close(), 600)</script>' : ''}</body></html>`
}
