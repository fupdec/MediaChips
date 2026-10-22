/** The API listener owns callbacks, never the renderer's origin or Host header. */
export function localCloudCallback(port: number, kind: 'drive' | 'cloud-accounts') {
  return `http://127.0.0.1:${port}/api/${kind}/oauth/callback`
}
export function callbackReachesApi(uri: string, apiPort: number | undefined) {
  const callback = new URL(uri)
  if (!['localhost', '127.0.0.1', '[::1]'].includes(callback.hostname)) return true
  return Number(callback.port || (callback.protocol === 'https:' ? 443 : 80)) === apiPort
}
