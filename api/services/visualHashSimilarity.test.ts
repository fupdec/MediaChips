import {describe, expect, it} from 'vitest'
import {
  areVisuallySimilar,
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
})
