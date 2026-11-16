import {describe, expect, it} from 'vitest'
import {clusterVisualMatches, compareVisualFingerprints, type VisualFingerprint} from './visualHashSimilarity'

const white = 'ffffffffffffffff'
const black = '0000000000000000'
const stripes = 'aaaaaaaaaaaaaaaa'
const fingerprint = (hash = '', tiles: string[] = [], thumbnail?: string): VisualFingerprint => ({hash, tiles, thumbnail})

describe('visual thumbnail evidence', () => {
  it('prioritizes a confident grid match over thumbnails', () => {
    expect(compareVisualFingerprints(fingerprint(stripes, [], white), fingerprint(stripes, [], white)))
      .toEqual({confidence: 'confident', reason: 'grid'})
  })

  it('requires six aligned frames for confidence; five stay insufficient', () => {
    const a = fingerprint(white, Array(9).fill(stripes))
    expect(compareVisualFingerprints(a, fingerprint(black, [...Array(6).fill(stripes), ...Array(3).fill(black)])))
      .toEqual({confidence: 'confident', reason: 'tiles', matchingTiles: 6})
    expect(compareVisualFingerprints(a, fingerprint(black, [...Array(5).fill(stripes), ...Array(4).fill(black)]))).toBeNull()
  })

  it('supports thumbnail-only videos and the tile distance boundary', () => {
    expect(compareVisualFingerprints(fingerprint('', [], white), fingerprint('', [], 'ffffffffffffff00')))
      .toEqual({confidence: 'possible', reason: 'thumbnails'})
    expect(compareVisualFingerprints(fingerprint('', [], white), fingerprint('', [], 'fffffffffffffe00'))).toBeNull()
  })

  it('compares thumbnails to any frame in both directions', () => {
    const thumb = fingerprint('', [], stripes)
    const grid = fingerprint(white, [black, black, stripes, ...Array(6).fill(black)])
    expect(compareVisualFingerprints(thumb, grid)).toEqual({confidence: 'possible', reason: 'thumbnailFrame', thumbnailSide: 'a', frameIndex: 3})
    expect(compareVisualFingerprints(grid, thumb)).toEqual({confidence: 'possible', reason: 'thumbnailFrame', thumbnailSide: 'b', frameIndex: 3})
    for (const rows of [
      [{id: 1, visualHash: '', visualHashThumbnail: stripes}, {id: 2, visualHash: white, visualHashTiles: grid.tiles.join(':')}],
      [{id: 2, visualHash: white, visualHashTiles: grid.tiles.join(':')}, {id: 1, visualHash: '', visualHashThumbnail: stripes}],
    ]) {
      const groups = clusterVisualMatches(rows)
      expect(groups).toHaveLength(1)
      expect(groups[0].matches?.[0]).toMatchObject({reason: 'thumbnailFrame', thumbnailId: 1, frameIndex: 3})
    }
  })

  it('does not join strong groups through weak thumbnails or chain weak pairs', () => {
    const groups = clusterVisualMatches([
      {id: 1, visualHash: white, visualHashThumbnail: stripes},
      {id: 2, visualHash: white, visualHashThumbnail: stripes},
      {id: 3, visualHash: black, visualHashThumbnail: stripes},
      {id: 4, visualHash: black, visualHashThumbnail: stripes},
    ])
    expect(groups.filter(group => group.confidence === 'confident').map(group => group.ids)).toEqual([[1, 2], [3, 4]])
    expect(groups.filter(group => group.confidence === 'possible')).toHaveLength(4)
    expect(groups.every(group => group.ids.length === 2)).toBe(true)
    expect(groups[0].matches?.[0].reason).toBe('grid')
  })

  it('ignores empty and malformed fingerprints', () => {
    expect(compareVisualFingerprints(fingerprint('', [], ''), fingerprint('', [], 'oops'))).toBeNull()
  })
})
