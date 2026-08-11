import {describe, expect, it} from 'vitest'
import {
  NEIGHBOR_AUTO_APPLY_MIN_COUNT,
  flattenNeighborSuggestions,
  splitNeighborSuggestionsByCount,
} from './smartLibrarySuggestions'

describe('smartLibrarySuggestions', () => {
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
