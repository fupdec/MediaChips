import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TAG_PAGE_DESIGN,
  getTagPageHeaderAspectRatio,
  normalizeTagPageDesign,
  resolveAutoTagPageDesign,
} from './tagPageDesign'

describe('tagPageDesign', () => {
  it('normalizes unknown values to profile', () => {
    expect(normalizeTagPageDesign(undefined)).toBe(DEFAULT_TAG_PAGE_DESIGN)
    expect(normalizeTagPageDesign('unknown')).toBe(DEFAULT_TAG_PAGE_DESIGN)
    expect(normalizeTagPageDesign(null)).toBe(DEFAULT_TAG_PAGE_DESIGN)
  })

  it('keeps supported design values and maps legacy compact to profile', () => {
    expect(normalizeTagPageDesign('compact')).toBe(DEFAULT_TAG_PAGE_DESIGN)
    expect(normalizeTagPageDesign('minimal')).toBe('minimal')
    expect(normalizeTagPageDesign('profile')).toBe('profile')
  })

  it('returns the profile header aspect ratio for all designs', () => {
    expect(getTagPageHeaderAspectRatio('profile')).toBeCloseTo(1400 / 609)
    expect(getTagPageHeaderAspectRatio('minimal')).toBeCloseTo(1400 / 609)
  })

  it('resolves auto tag page design from hero image presence', () => {
    expect(resolveAutoTagPageDesign({})).toBe('minimal')
    expect(resolveAutoTagPageDesign({hasHeader: true})).toBe('profile')
    expect(resolveAutoTagPageDesign({hasMain: true})).toBe('profile')
    expect(resolveAutoTagPageDesign({hasAlt: true})).toBe('profile')
  })
})
