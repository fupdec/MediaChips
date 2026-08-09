import {describe, expect, it} from 'vitest'
import {
  filterUnseenNeighborIds,
  seedNeedsGridForSimilarSearch,
  shouldRefillSimilarRadio,
  SIMILAR_RADIO_KEEP_LIMIT,
  SIMILAR_RADIO_REFILL_REMAINING,
} from './similarRadio'

describe('seedNeedsGridForSimilarSearch', () => {
  it('is true for thumb-only / partial tile indexes', () => {
    expect(seedNeedsGridForSimilarSearch(1)).toBe(true)
    expect(seedNeedsGridForSimilarSearch(8)).toBe(true)
  })

  it('is false for missing embedding or full 3×3 grid', () => {
    expect(seedNeedsGridForSimilarSearch(0)).toBe(false)
    expect(seedNeedsGridForSimilarSearch(9)).toBe(false)
    expect(seedNeedsGridForSimilarSearch(NaN)).toBe(false)
  })
})

describe('filterUnseenNeighborIds', () => {
  it('drops excluded and non-positive ids while preserving order', () => {
    expect(filterUnseenNeighborIds({
      neighborIds: [5, 1, 5, 0, -2, '3', null, 2, 1],
      excludeIds: [1, 9],
      limit: 10,
    })).toEqual([5, 3, 2])
  })

  it('caps at keep limit', () => {
    const ids = Array.from({length: SIMILAR_RADIO_KEEP_LIMIT + 5}, (_, i) => i + 1)
    expect(filterUnseenNeighborIds({
      neighborIds: ids,
      excludeIds: [],
    })).toHaveLength(SIMILAR_RADIO_KEEP_LIMIT)
  })

  it('returns empty when everything was seen', () => {
    expect(filterUnseenNeighborIds({
      neighborIds: [1, 2, 3],
      excludeIds: [1, 2, 3, 4],
    })).toEqual([])
  })
})

describe('shouldRefillSimilarRadio', () => {
  it('refills when remaining slots at or below threshold', () => {
    expect(shouldRefillSimilarRadio({
      playlistLength: 10,
      nowPlaying: 8,
      remainingThreshold: SIMILAR_RADIO_REFILL_REMAINING,
    })).toBe(true)
    expect(shouldRefillSimilarRadio({
      playlistLength: 10,
      nowPlaying: 7,
    })).toBe(false)
  })

  it('refills on last and penultimate items', () => {
    expect(shouldRefillSimilarRadio({playlistLength: 5, nowPlaying: 4})).toBe(true)
    expect(shouldRefillSimilarRadio({playlistLength: 5, nowPlaying: 3})).toBe(true)
    expect(shouldRefillSimilarRadio({playlistLength: 5, nowPlaying: 2})).toBe(false)
  })

  it('handles empty playlist', () => {
    expect(shouldRefillSimilarRadio({playlistLength: 0, nowPlaying: 0})).toBe(false)
  })
})
