import {describe, expect, it, beforeEach} from 'vitest'
import {
  clearHoverPreviewUnavailableCache,
  HOVER_PREVIEW_UNAVAILABLE_TTL_MS,
  isHoverPreviewUnavailableCached,
  markHoverPreviewUnavailableCached,
  resetHoverPreviewUnavailableCacheForTests,
} from './hoverPreviewUnavailableCache'

describe('hoverPreviewUnavailableCache', () => {
  beforeEach(() => {
    resetHoverPreviewUnavailableCacheForTests()
  })

  it('remembers unavailable media ids until cleared or TTL expires', () => {
    expect(isHoverPreviewUnavailableCached(42)).toBe(false)
    markHoverPreviewUnavailableCached(42)
    expect(isHoverPreviewUnavailableCached(42)).toBe(true)
    expect(isHoverPreviewUnavailableCached('42')).toBe(true)
    expect(isHoverPreviewUnavailableCached(7)).toBe(false)

    clearHoverPreviewUnavailableCache()
    expect(isHoverPreviewUnavailableCached(42)).toBe(false)
  })

  it('expires sticky unavailable entries after TTL', () => {
    markHoverPreviewUnavailableCached(9, 1_000)
    const now = Date.now()
    expect(isHoverPreviewUnavailableCached(9, now)).toBe(true)
    expect(isHoverPreviewUnavailableCached(9, now + 1_001)).toBe(false)
    expect(HOVER_PREVIEW_UNAVAILABLE_TTL_MS).toBe(60_000)
  })

  it('ignores invalid ids', () => {
    markHoverPreviewUnavailableCached(0)
    markHoverPreviewUnavailableCached(-1)
    markHoverPreviewUnavailableCached(null)
    markHoverPreviewUnavailableCached(undefined)
    markHoverPreviewUnavailableCached(Number.NaN)
    expect(isHoverPreviewUnavailableCached(0)).toBe(false)
  })
})
