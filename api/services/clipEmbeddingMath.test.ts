import {describe, expect, it} from 'vitest'
import {
  cosineSimilarity,
  l2Normalize,
  packFloat32Embedding,
  rankByCosineSimilarity,
  unpackFloat32Embedding,
} from './clipEmbeddingMath'

describe('clipEmbeddingMath', () => {
  it('normalizes vectors to unit length', () => {
    const normalized = l2Normalize([3, 4])
    expect(normalized[0]).toBeCloseTo(0.6, 5)
    expect(normalized[1]).toBeCloseTo(0.8, 5)
    expect(cosineSimilarity(normalized, normalized)).toBeCloseTo(1, 5)
  })

  it('round-trips float32 packing', () => {
    const values = l2Normalize([0.1, -0.2, 0.3, 0.4])
    const packed = packFloat32Embedding(values)
    const unpacked = unpackFloat32Embedding(packed)
    expect(unpacked).toHaveLength(values.length)
    unpacked.forEach((value, index) => {
      expect(value).toBeCloseTo(values[index], 5)
    })
  })

  it('ranks candidates by cosine similarity', () => {
    const query = l2Normalize([1, 0, 0])
    const ranked = rankByCosineSimilarity(query, [
      {id: 1, embedding: l2Normalize([0.2, 1, 0])},
      {id: 2, embedding: l2Normalize([0, 1, 0])},
      {id: 3, embedding: l2Normalize([1, 0.05, 0])},
    ], 2)
    expect(ranked).toEqual([3, 1])
  })

  it('returns empty ranks for empty query or non-positive limit', () => {
    expect(rankByCosineSimilarity([], [{id: 1, embedding: [1]}], 5)).toEqual([])
    expect(rankByCosineSimilarity([1], [{id: 1, embedding: [1]}], 0)).toEqual([])
  })
})
