import {describe, expect, it} from 'vitest'
import {
  areVisuallySimilar,
  averageHashFromBitmap,
  bitsToHex,
  collectVisualNearNeighborIds,
  decodeVisualHashTiles,
  encodeVisualHashTiles,
  hammingDistanceHex,
  rankVisualSimilarIds,
} from './visualHashSimilarity'

describe('visualHashSimilarity', () => {
  it('encodes tiles and measures hamming distance', () => {
    const tiles = ['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb']
    expect(decodeVisualHashTiles(encodeVisualHashTiles(tiles))).toEqual(tiles)
    expect(hammingDistanceHex('ffffffffffffffff', 'ffffffffffffffff')).toBe(0)
    expect(hammingDistanceHex('ffffffffffffffff', '0000000000000000')).toBe(64)
  })

  it('treats near-identical fingerprints as similar', () => {
    const a = {hash: 'ffffffffffffffff', tiles: []}
    const b = {hash: 'fffffffffffffffe', tiles: []}
    expect(areVisuallySimilar(a, b)).toBe(true)
  })

  it('thresholds average-hash bits from RGBA pixels', () => {
    // 2×2: dark, dark, bright, bright → avg mid → 0011
    const data = [
      0, 0, 0, 255, 10, 0, 0, 255,
      200, 0, 0, 255, 255, 0, 0, 255,
    ]
    expect(averageHashFromBitmap(data, 2, 2)).toBe('0011')
    expect(bitsToHex('0011001100110011001100110011001100110011001100110011001100110011')).toHaveLength(16)
  })

  it('ranks similar ids with seed first by hamming distance', () => {
    const seed = {id: 1, visualHash: 'ffffffffffffffff', visualHashTiles: null}
    const rows = [
      seed,
      {id: 2, visualHash: 'fffffffffffffffe', visualHashTiles: null},
      {id: 3, visualHash: 'fffffffffffffffc', visualHashTiles: null},
      {id: 4, visualHash: '0000000000000000', visualHashTiles: null},
    ]
    expect(rankVisualSimilarIds(seed, rows, {limit: 10})).toEqual([1, 2, 3])
    expect(rankVisualSimilarIds(seed, rows, {limit: 1})).toEqual([1, 2])
  })

  it('returns empty ranking when seed has no hash', () => {
    expect(rankVisualSimilarIds(
      {id: 1, visualHash: '', visualHashTiles: null},
      [{id: 2, visualHash: 'ffffffffffffffff', visualHashTiles: null}],
    )).toEqual([])
  })

  it('collects BK near neighbors without loading far hashes as candidates', () => {
    const seed = {id: 1, visualHash: 'ffffffffffffffff'}
    const lean = [
      seed,
      {id: 2, visualHash: 'fffffffffffffffe'},
      {id: 3, visualHash: 'ffffffffffffff00'},
      {id: 4, visualHash: '0000000000000000'},
    ]
    const neighbors = collectVisualNearNeighborIds(seed, lean)
    expect(neighbors).toContain(2)
    expect(neighbors).not.toContain(4)
    expect(neighbors).not.toContain(1)
  })
})
