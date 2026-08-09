import {describe, expect, it} from 'vitest'
import {
  buildSemanticHits,
  countSeekableSemanticHits,
} from './mediaClipEmbeddings'

describe('buildSemanticHits / countSeekableSemanticHits', () => {
  it('maps full 9-tile embeddings to seek times and counts seekable hits', () => {
    const embeddings = Array.from({length: 9}, () => [0, 0, 0, 1])
    const candidatesById = new Map([
      [1, {embeddings}],
      [2, {embeddings: [[0, 0, 0, 1]]}],
    ])
    const durations = new Map([
      [1, 90],
      [2, 90],
    ])
    const hits = buildSemanticHits(
      [
        {id: 1, tileIndex: 4},
        {id: 2, tileIndex: 0},
      ],
      candidatesById,
      durations,
    )
    expect(hits[0].time).toBeGreaterThan(0)
    expect(hits[0].tileIndex).toBe(4)
    expect(hits[1].time).toBeNull()
    expect(hits[1].tileIndex).toBeNull()
    expect(countSeekableSemanticHits(hits)).toBe(1)
  })
})
