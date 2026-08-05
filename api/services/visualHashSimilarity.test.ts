import {describe, expect, it} from 'vitest'
import {
  areVisuallySimilar,
  averageHashFromBitmap,
  bitsToHex,
  decodeVisualHashTiles,
  encodeVisualHashTiles,
  hammingDistanceHex,
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
})
