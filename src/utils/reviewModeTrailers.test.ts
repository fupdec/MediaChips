import {describe, expect, it} from 'vitest'
import {
  formatReviewDuration,
  reviewTileClipWindow,
  REVIEW_TILE_CLIP_SECONDS,
} from './reviewModeTrailers'

describe('reviewTileClipWindow', () => {
  it('starts at the grid mid-slice and spans clipSec', () => {
    // duration 900 → durSlice 100; tile 0 mid = 50
    const window = reviewTileClipWindow(900, 0, 5)
    expect(window).toEqual({start: 50, end: 55})
  })

  it('uses default clip length of 10 seconds', () => {
    const window = reviewTileClipWindow(900, 1)
    // tile 1 mid = 150
    expect(window).toEqual({start: 150, end: 150 + REVIEW_TILE_CLIP_SECONDS})
  })

  it('clamps the end at EOF and shifts start back when needed', () => {
    // duration 12 → durSlice 1; tile 8 mid = 8.5 → clamped seek ~11.95
    const window = reviewTileClipWindow(12, 8, 5)
    expect(window).not.toBeNull()
    expect(window!.end).toBeLessThanOrEqual(12)
    expect(window!.end - window!.start).toBeGreaterThan(0)
    expect(window!.start).toBeGreaterThanOrEqual(0)
  })

  it('returns null for invalid duration or tile', () => {
    expect(reviewTileClipWindow(0, 0)).toBeNull()
    expect(reviewTileClipWindow(-10, 0)).toBeNull()
    expect(reviewTileClipWindow(100, -1)).toBeNull()
    expect(reviewTileClipWindow(100, 9)).toBeNull()
    expect(reviewTileClipWindow(Number.NaN, 0)).toBeNull()
  })
})

describe('formatReviewDuration', () => {
  it('formats mm:ss and h:mm:ss', () => {
    expect(formatReviewDuration(65)).toBe('1:05')
    expect(formatReviewDuration(3661)).toBe('1:01:01')
    expect(formatReviewDuration(null)).toBe('0:00')
  })
})
