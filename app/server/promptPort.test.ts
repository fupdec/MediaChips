/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import { FIXED_PORT, isValidListenPort, resolveListenPort } from './ports'
import { parsePortInput, suggestAlternatePort } from './promptPort'

describe('ports', () => {
  it('resolves valid ports and falls back to FIXED_PORT', () => {
    expect(resolveListenPort(12345)).toBe(12345)
    expect(resolveListenPort(1)).toBe(1)
    expect(resolveListenPort(65535)).toBe(65535)
    expect(resolveListenPort(0)).toBe(FIXED_PORT)
    expect(resolveListenPort(65536)).toBe(FIXED_PORT)
    expect(resolveListenPort(12.5)).toBe(FIXED_PORT)
    expect(resolveListenPort('12321')).toBe(FIXED_PORT)
    expect(resolveListenPort(undefined)).toBe(FIXED_PORT)
  })

  it('validates listen ports', () => {
    expect(isValidListenPort(12321)).toBe(true)
    expect(isValidListenPort(0)).toBe(false)
    expect(isValidListenPort(-1)).toBe(false)
  })
})

describe('promptPort helpers', () => {
  it('parses port input strings', () => {
    expect(parsePortInput('12322')).toBe(12322)
    expect(parsePortInput('  443  ')).toBe(443)
    expect(parsePortInput('')).toBeNull()
    expect(parsePortInput('abc')).toBeNull()
    expect(parsePortInput('12.3')).toBeNull()
    expect(parsePortInput('0')).toBeNull()
    expect(parsePortInput('65536')).toBeNull()
  })

  it('suggests the next port when possible', () => {
    expect(suggestAlternatePort(12321)).toBe(12322)
    expect(suggestAlternatePort(65535)).toBe(FIXED_PORT)
    expect(suggestAlternatePort(FIXED_PORT)).toBe(12322)
  })
})
