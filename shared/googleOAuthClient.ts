/** Parse the client_secret_*.json file Google Cloud offers for download.
 * "installed" (Desktop app) clients accept any loopback port/path, so they
 * need no redirect URI registration — the recommended, zero-config option. */
export type GoogleOAuthClientFile = {
  type: 'installed' | 'web'
  clientId: string
  clientSecret: string
  redirectUris: string[]
}

export function parseGoogleOAuthClientFile(text: string): GoogleOAuthClientFile | null {
  let raw: unknown
  try { raw = JSON.parse(text.trim()) } catch { return null }
  if (!raw || typeof raw !== 'object') return null
  const root = raw as Record<string, unknown>
  const type = root.installed ? 'installed' : root.web ? 'web' : null
  const body = (type ? root[type] : root) as Record<string, unknown> | undefined
  if (!body || typeof body !== 'object') return null
  const clientId = typeof body.client_id === 'string' ? body.client_id.trim() : ''
  const clientSecret = typeof body.client_secret === 'string' ? body.client_secret.replace(/\s+/g, '') : ''
  if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId) || !clientSecret) return null
  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((v): v is string => typeof v === 'string') : []
  return {type: type || 'installed', clientId, clientSecret, redirectUris}
}

const LOOPBACK = ['localhost', '127.0.0.1', '[::1]']
const isLoopback = (uri: string) => { try { return LOOPBACK.includes(new URL(uri).hostname) } catch { return false } }

/** Pick the redirect URI to save. Desktop clients and loopback callbacks use
 * the automatic (current API port) address; web clients keep an exact
 * registered callback that ends with the expected path. */
export function googleClientRedirect(file: GoogleOAuthClientFile, suggested: string, callbackPath: string): {redirectUri?: string; registered: boolean} {
  if (file.type === 'installed') return {registered: true}
  if (file.redirectUris.includes(suggested)) return {registered: true}
  const external = file.redirectUris.find(uri => { try { return new URL(uri).pathname === callbackPath && !isLoopback(uri) } catch { return false } })
  if (external) return {redirectUri: external, registered: true}
  return {registered: false}
}
