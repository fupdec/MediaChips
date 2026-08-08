import {describe, expect, it, beforeEach} from 'vitest'
import {
  clearHoverPreviewUnavailableCache,
  isHoverPreviewUnavailableCached,
  markHoverPreviewUnavailableCached,
  resetHoverPreviewUnavailableCacheForTests,
} from './hoverPreviewUnavailableCache'

describe('hoverPreviewUnavailableCache', () => {
  beforeEach(() => {
    resetHoverPreviewUnavailableCacheForTests()
  })

  it('remembers unavailable media ids until cleared', () => {
    expect(isHoverPreviewUnavailableCached(42)).toBe(false)
    markHoverPreviewUnavailableCached(42)
    expect(isHoverPreviewUnavailableCached(42)).toBe(true)
    expect(isHoverPreviewUnavailableCached('42')).toBe(true)
    expect(isHoverPreviewUnavailableCached(7)).toBe(false)

    clearHoverPreviewUnavailableCache()
    expect(isHoverPreviewUnavailableCached(42)).toBe(false)
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
