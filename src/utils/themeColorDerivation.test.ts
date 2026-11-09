import { describe, expect, it } from 'vitest'
import { derivePaletteFromBase, isValidHexColor } from '@/utils/themeColorDerivation'

describe('derivePaletteFromBase', () => {
  describe('light mode', () => {
    it('generates a full palette from a purple base', () => {
      const result = derivePaletteFromBase('#8A86F2', 'light')
      expect(result.primary).toMatch(/^#[0-9a-f]{6}$/)
      expect(result.header).toMatch(/^#[0-9a-f]{6}$/)
      expect(result.secondary).toMatch(/^#[0-9a-f]{6}$/)
      // Header should be distinctly different from primary
      expect(result.header).not.toBe(result.primary)
      expect(result.secondary).not.toBe(result.primary)
    })

    it('generates a full palette from a blue base', () => {
      const result = derivePaletteFromBase('#3B82F6', 'light')
      expect(result.primary).toMatch(/^#[0-9a-f]{6}$/)
      expect(result.header).toMatch(/^#[0-9a-f]{6}$/)
      expect(result.secondary).toMatch(/^#[0-9a-f]{6}$/)
    })

    it('generates a full palette from a red base', () => {
      const result = derivePaletteFromBase('#EF4444', 'light')
      expect(result.primary).toMatch(/^#[0-9a-f]{6}$/)
      expect(result.header).toMatch(/^#[0-9a-f]{6}$/)
      expect(result.secondary).toMatch(/^#[0-9a-f]{6}$/)
    })

    it('returns fallback for invalid color', () => {
      const result = derivePaletteFromBase('not-color', 'light')
      expect(result).toEqual(derivePaletteFromBase('#8A86F2', 'light'))
    })
  })

  describe('dark mode', () => {
    it('generates a full palette from a purple base', () => {
      const result = derivePaletteFromBase('#8A86F2', 'dark')
      expect(result.primary).toMatch(/^#[0-9a-f]{6}$/)
      expect(result.header).toMatch(/^#[0-9a-f]{6}$/)
      expect(result.secondary).toMatch(/^#[0-9a-f]{6}$/)
      // Dark mode should return lighter versions
      const hexToNum = (hex: string) => parseInt(hex.replace('#', '').slice(0, 2), 16)
      expect(hexToNum(result.primary)).toBeGreaterThan(hexToNum('#8A86F2'.toLowerCase()))
    })

    it('returns fallback for invalid color', () => {
      const result = derivePaletteFromBase('not-color', 'dark')
      expect(result).toEqual(derivePaletteFromBase('#8A86F2', 'dark'))
    })
  })
})

describe('isValidHexColor', () => {
  it('accepts valid 6-digit hex with hash', () => {
    expect(isValidHexColor('#ff6600')).toBe(true)
  })

  it('accepts valid 6-digit hex without hash', () => {
    expect(isValidHexColor('ff6600')).toBe(true)
  })

  it('accepts valid 3-digit hex with hash', () => {
    expect(isValidHexColor('#f60')).toBe(true)
  })

  it('rejects invalid strings', () => {
    expect(isValidHexColor('xyz')).toBe(false)
    expect(isValidHexColor('#ggg')).toBe(false)
    expect(isValidHexColor('')).toBe(false)
  })
})