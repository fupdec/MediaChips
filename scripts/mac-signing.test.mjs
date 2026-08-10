import {describe, expect, it} from 'vitest'
import {
  applyMacDeveloperIdSigning,
  hasAppleNotarizeCredentials,
  wantsMacDeveloperIdSign,
} from './mac-signing.mjs'

describe('mac-signing', () => {
  it('wantsMacDeveloperIdSign reads opt-in flags', () => {
    expect(wantsMacDeveloperIdSign({})).toBe(false)
    expect(wantsMacDeveloperIdSign({MEDIA_CHIPS_MAC_SIGN: '1'})).toBe(true)
    expect(wantsMacDeveloperIdSign({CSC_LINK: 'base64'})).toBe(true)
    expect(wantsMacDeveloperIdSign({CSC_NAME: 'Developer ID Application: Test'})).toBe(true)
  })

  it('hasAppleNotarizeCredentials accepts either auth style', () => {
    expect(hasAppleNotarizeCredentials({})).toBe(false)
    expect(hasAppleNotarizeCredentials({
      APPLE_ID: 'a@b.c',
      APPLE_APP_SPECIFIC_PASSWORD: 'x',
      APPLE_TEAM_ID: 'TEAM',
    })).toBe(true)
    expect(hasAppleNotarizeCredentials({
      APPLE_API_KEY: '/tmp/key.p8',
      APPLE_API_KEY_ID: 'KEY',
      APPLE_API_ISSUER: 'uuid',
    })).toBe(true)
  })

  it('applyMacDeveloperIdSigning drops ad-hoc identity and sets entitlements', () => {
    const next = applyMacDeveloperIdSigning({
      appId: 'com.mediachips.app',
      mac: {
        identity: '-',
        hardenedRuntime: false,
        category: 'public.app-category.utilities',
      },
    })
    expect(next.mac.identity).toBeUndefined()
    expect(next.mac.hardenedRuntime).toBe(true)
    expect(next.mac.entitlements).toBe('build/entitlements.mac.plist')
    expect(next.mac.entitlementsInherit).toBe('build/entitlements.mac.plist')
    expect(next.mac.category).toBe('public.app-category.utilities')
  })

  it('applyMacDeveloperIdSigning keeps CSC_NAME as identity', () => {
    const next = applyMacDeveloperIdSigning(
      {mac: {identity: '-'}},
      {CSC_NAME: 'Developer ID Application: Someone (ABC)'},
    )
    expect(next.mac.identity).toBe('Developer ID Application: Someone (ABC)')
  })
})
