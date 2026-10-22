// @vitest-environment node
import {it, expect} from 'vitest'
import {localCloudCallback, callbackReachesApi} from './cloudOAuthCallback'
it('uses the API listener port for both callback paths', () => {
  expect(localCloudCallback(12321, 'drive')).toBe('http://127.0.0.1:12321/api/drive/oauth/callback')
  expect(localCloudCallback(23456, 'cloud-accounts')).toBe('http://127.0.0.1:23456/api/cloud-accounts/oauth/callback')
})
it('rejects callbacks targeting Vite, including localhost and IPv6 aliases', () => {
  for (const host of ['127.0.0.1', 'localhost', '[::1]']) {
    expect(callbackReachesApi(`http://${host}:5173/api/drive/oauth/callback`, 12321)).toBe(false)
    expect(callbackReachesApi(`http://${host}:12321/api/drive/oauth/callback`, 12321)).toBe(true)
  }
  expect(callbackReachesApi('http://localhost/api/drive/oauth/callback', 12321)).toBe(false)
})
it('preserves explicitly configured server HTTPS callbacks', () => {
  expect(callbackReachesApi('https://media.example/api/drive/oauth/callback', 12321)).toBe(true)
})
