import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TAG_PAGE_DESIGN,
  getTagPageHeaderAspectRatio,
  normalizeTagPageDesign,
} from './tagPageDesign'

describe('tagPageDesign', () => {
  it('normalizes unknown values to profile', () => {
    expect(normalizeTagPageDesign(undefined)).toBe(DEFAULT_TAG_PAGE_DESIGN)
    expect(normalizeTagPageDesign('unknown')).toBe(DEFAULT_TAG_PAGE_DESIGN)
    expect(normalizeTagPageDesign(null)).toBe(DEFAULT_TAG_PAGE_DESIGN)
  })

  it('keeps supported design values', () => {
    expect(normalizeTagPageDesign('compact')).toBe('compact')
    expect(normalizeTagPageDesign('minimal')).toBe('minimal')
    expect(normalizeTagPageDesign('profile')).toBe('profile')
  })

  it('returns different header aspect ratios per design', () => {
    expect(getTagPageHeaderAspectRatio('profile')).toBeCloseTo(1400 / 609)
    expect(getTagPageHeaderAspectRatio('compact')).toBe(4)
    expect(getTagPageHeaderAspectRatio('minimal')).toBeCloseTo(1400 / 609)
  })
})
