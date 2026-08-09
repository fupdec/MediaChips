import {describe, expect, it} from 'vitest'
import {
  CLIP_AUTO_APPLY_MIN_CONFIDENCE,
  NEIGHBOR_AUTO_APPLY_MIN_COUNT,
  flattenNeighborSuggestions,
  normalizeClipSuggestions,
  splitClipSuggestionsByConfidence,
  splitNeighborSuggestionsByCount,
} from './smartLibrarySuggestions'

describe('smartLibrarySuggestions', () => {
  it('normalizes CLIP suggestions and keeps max confidence + media ids', () => {
    const rows = normalizeClipSuggestions([
      {word: 'Beach', confidence: 0.2, mediaIds: [1]},
      {word: 'beach', confidence: 0.5, mediaIds: [2]},
      {word: '  ', confidence: 0.9, mediaIds: [3]},
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.word).toBe('Beach')
    expect(rows[0]?.confidence).toBe(0.5)
    expect(rows[0]?.mediaIds).toEqual([1, 2])
  })

  it('splits CLIP suggestions by auto-apply confidence threshold', () => {
    const {high, low} = splitClipSuggestionsByConfidence([
      {word: 'a', confidence: CLIP_AUTO_APPLY_MIN_CONFIDENCE, mediaIds: [1]},
      {word: 'b', confidence: CLIP_AUTO_APPLY_MIN_CONFIDENCE - 0.01, mediaIds: [2]},
    ])
    expect(high.map((row) => row.word)).toEqual(['a'])
    expect(low.map((row) => row.word)).toEqual(['b'])
  })

  it('flattens neighbor suggestions across media and splits by count', () => {
    const flat = flattenNeighborSuggestions([
      {
        mediaId: 10,
        suggestions: [
          {tagId: 1, metaId: 2, name: 'Alice', count: 4},
          {tagId: 3, metaId: 2, name: 'Bob', count: 1},
        ],
      },
      {
        mediaId: 11,
        suggestions: [
          {tagId: 1, metaId: 2, name: 'Alice', count: 2},
        ],
      },
    ])
    expect(flat).toHaveLength(2)
    const alice = flat.find((row) => row.name === 'Alice')
    expect(alice?.count).toBe(4)
    expect(alice?.mediaIds).toEqual([10, 11])

    const {high, low} = splitNeighborSuggestionsByCount(flat, NEIGHBOR_AUTO_APPLY_MIN_COUNT)
    expect(high.map((row) => row.name)).toEqual(['Alice'])
    expect(low.map((row) => row.name)).toEqual(['Bob'])
  })
})
