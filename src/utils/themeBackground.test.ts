import { describe, expect, it } from 'vitest'
import {
  derivePageBackground,
  deriveSurfaceBackground,
  deriveSurfaceVariantBackground,
} from '@/utils/themeBackground'

describe('derivePageBackground', () => {
  it('tints light background from primary', () => {
    expect(derivePageBackground('#6B63E8', 'light')).toBe('#fbfafe')
  })

  it('tints dark background toward the default dark surface', () => {
    expect(derivePageBackground('#9B93E8', 'dark')).toBe('#1a1a1f')
  })

  it('falls back on invalid color', () => {
    expect(derivePageBackground('not-a-color', 'light')).toBe('#fafafa')
    expect(derivePageBackground('not-a-color', 'dark')).toBe('#121212')
  })
})

describe('deriveSurfaceBackground', () => {
  it('derives light surface tinted from primary', () => {
    const result = deriveSurfaceBackground('#6B63E8', 'light')
    expect(result).toBe('#f8f7fe')
  })

  it('derives dark surface tinted from primary', () => {
    const result = deriveSurfaceBackground('#9B93E8', 'dark')
    expect(result).toBe('#2b2a32')
  })

  it('falls back on invalid color', () => {
    expect(deriveSurfaceBackground('not-a-color', 'light')).toBe('#ffffff')
    expect(deriveSurfaceBackground('not-a-color', 'dark')).toBe('#1e1e1e')
  })
})

describe('deriveSurfaceVariantBackground', () => {
  it('derives light surface-variant tinted from primary', () => {
    const result = deriveSurfaceVariantBackground('#6B63E8', 'light')
    expect(result).toBe('#edecfc')
  })

  it('derives dark surface-variant tinted from primary', () => {
    const result = deriveSurfaceVariantBackground('#9B93E8', 'dark')
    expect(result).toBe('#302e41')
  })

  it('falls back on invalid color', () => {
    expect(deriveSurfaceVariantBackground('not-a-color', 'light')).toBe('#f0f0f0')
    expect(deriveSurfaceVariantBackground('not-a-color', 'dark')).toBe('#2a2a2a')
  })
})