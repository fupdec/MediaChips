import {describe, expect, it} from 'vitest'
import type {Request} from 'express'
import {completeOAuth, oauthLaunchMode, oauthResultPage, parseOAuthReturnUrl, registerOAuthHandler} from './oauthFlow'

const request = (remoteAddress: string, forwarded?: string) =>
  ({socket: {remoteAddress}, headers: forwarded ? {'x-forwarded-for': forwarded} : {}}) as unknown as Request
const STATE = 'a'.repeat(64)
const LOOPBACK = 'http://127.0.0.1:12321/api/drive/oauth/callback'

describe('oauthLaunchMode', () => {
  it('returns directly to a loopback callback only for a browser on the API machine', () => {
    expect(oauthLaunchMode(request('127.0.0.1'), LOOPBACK)).toBe('callback')
    expect(oauthLaunchMode(request('::ffff:127.0.0.1'), LOOPBACK)).toBe('callback')
    expect(oauthLaunchMode(request('::1'), LOOPBACK)).toBe('callback')
    expect(oauthLaunchMode(request('192.168.1.20'), LOOPBACK)).toBe('paste')
    expect(oauthLaunchMode(request('172.17.0.1'), LOOPBACK)).toBe('paste')
    expect(oauthLaunchMode(request('127.0.0.1', '192.168.1.20'), LOOPBACK)).toBe('paste')
  })
  it('always uses public callbacks directly', () => {
    expect(oauthLaunchMode(request('192.168.1.20'), 'https://media.example.com/api/drive/oauth/callback')).toBe('callback')
  })
})

describe('parseOAuthReturnUrl', () => {
  it('reads state, code and error from the pasted address', () => {
    expect(parseOAuthReturnUrl(`${LOOPBACK}?state=${STATE}&code=abc`)).toEqual({state: STATE, code: 'abc', error: undefined})
    expect(parseOAuthReturnUrl(`  ${LOOPBACK}?state=${STATE}&error=access_denied `)).toMatchObject({error: 'access_denied'})
  })
  it('rejects anything without a valid state', () => {
    for (const value of ['', 'not a url', `${LOOPBACK}?code=abc`, `${LOOPBACK}?state=short&code=abc`, 42]) expect(parseOAuthReturnUrl(value)).toBeNull()
  })
})

describe('completeOAuth', () => {
  it('dispatches by state to the provider that started sign-in', async () => {
    const calls: string[] = []
    const dispose = registerOAuthHandler({owns: state => state === STATE, async complete(state, code) { calls.push(`${state}:${code}`); return {ok: true} }})
    try {
      expect(await completeOAuth(STATE, 'code', undefined)).toEqual({ok: true})
      expect(await completeOAuth('b'.repeat(64), 'code', undefined)).toMatchObject({ok: false, code: 'expired'})
      expect(calls).toEqual([`${STATE}:code`])
    } finally { dispose() }
  })
  it('escapes messages in the result page', () => {
    expect(oauthResultPage({ok: false, code: 'x', message: '<script>'})).toContain('&lt;script&gt;')
  })
})
