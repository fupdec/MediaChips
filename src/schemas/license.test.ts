import { describe, expect, it } from 'vitest'
import { parseLicenseActivateResponse, parseLicenseInfo } from '@/schemas/license'

describe('license schemas', () => {
  it('parses license info', () => {
    const info = parseLicenseInfo({
      license_code: 'ABC-123',
      license_expiry: '2026-12-31',
    })

    expect(info?.license_code).toBe('ABC-123')
    expect(info?.license_expiry).toBe('2026-12-31')
  })

  it('parses activate response', () => {
    const response = parseLicenseActivateResponse({
      activated: true,
      license: { license_code: 'ABC-123' },
      message: 'ok',
    })

    expect(response?.activated).toBe(true)
    expect(response?.license?.license_code).toBe('ABC-123')
  })

  it('returns null when the license API responds with null', () => {
    expect(parseLicenseInfo(null)).toBeNull()
    expect(parseLicenseActivateResponse(null)).toBeNull()
  })
})
