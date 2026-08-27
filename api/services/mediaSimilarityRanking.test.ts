import {describe, expect, it} from 'vitest'
import {
  jaccardSimilarity,
  mergeMediaSimilarityIdLists,
  mergeMediaSimilarityLists,
} from './mediaSimilarityRanking'

describe('mediaSimilarityRanking', () => {
  it('computes Jaccard overlap', () => {
    expect(jaccardSimilarity(2, 4, 4)).toBeCloseTo(1 / 3)
    expect(jaccardSimilarity(3, 3, 3)).toBe(1)
    expect(jaccardSimilarity(0, 3, 3)).toBe(0)
    expect(jaccardSimilarity(2, 0, 3)).toBe(0)
  })

  it('fuses clip + tag ranks with RRF and keeps per-signal scores', () => {
    const merged = mergeMediaSimilarityLists([
      {
        signal: 'clip',
        weight: 1,
        hits: [
          {id: 10, score: 0.91, tileIndex: 7},
          {id: 20, score: 0.8},
          {id: 30, score: 0.7},
        ],
      },
      {
        signal: 'tags',
        weight: 1,
        hits: [
          {id: 30, score: 0.5},
          {id: 40, score: 0.4},
          {id: 10, score: 0.2},
        ],
      },
    ], {limit: 4, excludeIds: [99], rrfK: 60})

    expect(merged.map((hit) => hit.id)).toEqual([10, 30, 20, 40])
    expect(merged[0].signals.clip).toBe(0.91)
    expect(merged[0].signals.tags).toBe(0.2)
    expect(merged[0].tileIndex).toBe(7)
    expect(merged[1].signals.clip).toBe(0.7)
    expect(merged[1].signals.tags).toBe(0.5)
    expect(merged[1].tileIndex).toBeUndefined()
  })

  it('drops weak fused scores below minScoreRatio / minScore', () => {
    // RRF falls slowly; a high ratio keeps only the top rank.
    const byRatio = mergeMediaSimilarityLists([
      {
        signal: 'clip',
        weight: 1,
        hits: [
          {id: 1, score: 0.95},
          {id: 2, score: 0.9},
          {id: 3, score: 0.2},
          {id: 4, score: 0.1},
        ],
      },
    ], {limit: 10, rrfK: 60, minScoreRatio: 0.99})

    expect(byRatio.map((hit) => hit.id)).toEqual([1])

    // Absolute floor between rank-1 (~0.01639) and rank-2 (~0.01613).
    const byFloor = mergeMediaSimilarityLists([
      {
        signal: 'clip',
        weight: 1,
        hits: [
          {id: 1, score: 0.95},
          {id: 2, score: 0.9},
          {id: 99, score: 0.1},
        ],
      },
    ], {limit: 10, rrfK: 60, minScore: 0.0163})

    expect(byFloor.map((hit) => hit.id)).toEqual([1])
  })

  it('merges plain id lists', () => {
    const merged = mergeMediaSimilarityIdLists([
      {signal: 'clip', ids: [1, 2, 3]},
      {signal: 'tags', ids: [3, 4]},
    ], {limit: 4, rrfK: 60})
    expect(merged[0].id).toBe(3)
    expect(merged.map((hit) => hit.id)).toEqual([3, 1, 2, 4])
  })
})
