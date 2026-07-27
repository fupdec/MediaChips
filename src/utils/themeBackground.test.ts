import { describe, expect, it } from 'vitest'
import { derivePageBackground } from '@/utils/themeBackground'

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
