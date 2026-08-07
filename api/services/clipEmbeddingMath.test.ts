import {describe, expect, it} from 'vitest'
import {
  cosineSimilarity,
  getGridTileCropBoxes,
  l2Normalize,
  maxCosineSimilarity,
  maxPairwiseCosineSimilarity,
  packFloat32Embedding,
  packFloat32Embeddings,
  rankByCosineSimilarity,
  rankByMaxCosineSimilarity,
  rankByMaxCosineSimilarityHits,
  unpackFloat32Embedding,
  unpackFloat32Embeddings,
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

  it('packs and unpacks multiple tile vectors', () => {
    const tiles = [
      l2Normalize([1, 0, 0, 0]),
      l2Normalize([0, 1, 0, 0]),
      l2Normalize([0, 0, 1, 0]),
    ]
    const packed = packFloat32Embeddings(tiles)
    const unpacked = unpackFloat32Embeddings(packed, 4)
    expect(unpacked).toHaveLength(3)
    unpacked.forEach((vector, index) => {
      expect(vector).toHaveLength(4)
      vector.forEach((value, dim) => {
        expect(value).toBeCloseTo(tiles[index][dim], 5)
      })
    })
  })

  it('treats legacy single-vector blobs as one tile', () => {
    const values = l2Normalize([0.5, 0.5, 0, 0])
    const packed = packFloat32Embedding(values)
    expect(unpackFloat32Embeddings(packed, 4)).toHaveLength(1)
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

  it('ranks by best matching tile instead of average scene', () => {
    const query = l2Normalize([1, 0, 0])
    const ranked = rankByMaxCosineSimilarity(query, [
      {
        id: 1,
        // Mostly unrelated tiles, but one strong match.
        embeddings: [
          l2Normalize([0, 1, 0]),
          l2Normalize([0.95, 0.05, 0]),
          l2Normalize([0, 0, 1]),
        ],
      },
      {
        id: 2,
        // Mild match across a single whole-image vector.
        embeddings: [l2Normalize([0.4, 0.6, 0])],
      },
    ], 2)
    expect(ranked[0]).toBe(1)
    expect(maxCosineSimilarity(query, [
      l2Normalize([0, 1, 0]),
      l2Normalize([0.95, 0.05, 0]),
    ])).toBeGreaterThan(0.9)
  })

  it('returns the winning tile index for scene seek', () => {
    const query = l2Normalize([1, 0, 0])
    const hits = rankByMaxCosineSimilarityHits(query, [
      {
        id: 10,
        embeddings: [
          l2Normalize([0, 1, 0]),
          l2Normalize([0, 0, 1]),
          l2Normalize([0.99, 0.01, 0]),
        ],
      },
      {
        id: 11,
        embeddings: [l2Normalize([0.5, 0.5, 0])],
      },
    ], 2)
    expect(hits[0]).toMatchObject({id: 10, tileIndex: 2})
    expect(hits[1]).toMatchObject({id: 11, tileIndex: 0})
    expect(hits.map((hit) => hit.id)).toEqual(
      rankByMaxCosineSimilarity(query, [
        {
          id: 10,
          embeddings: [
            l2Normalize([0, 1, 0]),
            l2Normalize([0, 0, 1]),
            l2Normalize([0.99, 0.01, 0]),
          ],
        },
        {
          id: 11,
          embeddings: [l2Normalize([0.5, 0.5, 0])],
        },
      ], 2),
    )
  })

  it('scores similar media by best tile pair', () => {
    const seed = [
      l2Normalize([1, 0, 0]),
      l2Normalize([0, 1, 0]),
    ]
    const candidate = [
      l2Normalize([0, 0, 1]),
      l2Normalize([0.9, 0.1, 0]),
    ]
    expect(maxPairwiseCosineSimilarity(seed, candidate)).toBeGreaterThan(0.9)
  })

  it('returns empty ranks for empty query or non-positive limit', () => {
    expect(rankByCosineSimilarity([], [{id: 1, embedding: [1]}], 5)).toEqual([])
    expect(rankByCosineSimilarity([1], [{id: 1, embedding: [1]}], 0)).toEqual([])
    expect(rankByMaxCosineSimilarity([], [{id: 1, embeddings: [[1]]}], 5)).toEqual([])
  })

  it('builds inclusive 3x3 crop boxes covering the full sprite', () => {
    const boxes = getGridTileCropBoxes(300, 150, 3, 3)
    expect(boxes).toHaveLength(9)
    expect(boxes[0]).toEqual([0, 0, 99, 49])
    expect(boxes[2]).toEqual([200, 0, 299, 49])
    expect(boxes[8]).toEqual([200, 100, 299, 149])
  })
})
