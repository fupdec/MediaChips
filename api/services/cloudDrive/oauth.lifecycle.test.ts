// @vitest-environment node
import {afterEach, it, expect, vi} from 'vitest'
import axios from 'axios'
import {getValidAccessToken} from './oauth'
import type {DriveConfig, DriveOAuthTokens} from './types'
const config = {clientId: 'test-client', clientSecret: 'test-secret'} as DriveConfig
const store = () => {
  let tokens: DriveOAuthTokens | null = {accessToken: 'expired', refreshToken: 'refresh', expiryDate: 1}
  return {get: () => tokens, set: (next: DriveOAuthTokens) => { tokens = next }, clear: () => { tokens = null }, reload: () => tokens}
}
afterEach(() => vi.restoreAllMocks())
it('coalesces parallel refreshes and preserves a refresh token omitted by Google', async () => {
  const tokens = store(), post = vi.spyOn(axios, 'post').mockResolvedValue({data: {access_token: 'new-access', expires_in: 3600}})
  expect(await Promise.all([getValidAccessToken(config, tokens), getValidAccessToken(config, tokens)])).toEqual(['new-access', 'new-access'])
  expect(post).toHaveBeenCalledTimes(1)
  expect(tokens.get()?.refreshToken).toBe('refresh')
})
it('clears revoked authorization and requires a new sign-in', async () => {
  const tokens = store()
  vi.spyOn(axios, 'post').mockRejectedValue({isAxiosError: true, response: {data: {error: 'invalid_grant'}}})
  await expect(getValidAccessToken(config, tokens)).rejects.toMatchObject({code: 'auth_required'})
  expect(tokens.get()).toBeNull()
})
it('does not restore tokens after logout during refresh', async () => {
  const tokens = store()
  let resolve!: (value: any) => void
  vi.spyOn(axios, 'post').mockImplementation(() => new Promise(done => { resolve = done }))
  const active = getValidAccessToken(config, tokens)
  tokens.clear()
  const rejected = expect(active).rejects.toThrow('authorization changed')
  resolve({data: {access_token: 'late', expires_in: 3600}})
  await rejected
  expect(tokens.get()).toBeNull()
})
