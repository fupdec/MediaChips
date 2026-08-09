import {describe, expect, it} from 'vitest'
import {
  countSeekableHits,
  hasSemanticSceneTarget,
  hasUsableSceneSeek,
  pickFirstSeekableInTopN,
} from './semanticScenePlay'

describe('hasUsableSceneSeek', () => {
  it('accepts positive finite times', () => {
    expect(hasUsableSceneSeek(12.5)).toBe(true)
    expect(hasUsableSceneSeek(0)).toBe(false)
    expect(hasUsableSceneSeek(null)).toBe(false)
    expect(hasUsableSceneSeek(Number.NaN)).toBe(false)
  })
})

describe('hasSemanticSceneTarget', () => {
  it('accepts seek time or CLIP tile index', () => {
    expect(hasSemanticSceneTarget({segmentStart: 12})).toBe(true)
    expect(hasSemanticSceneTarget({semanticTileIndex: 8})).toBe(true)
    expect(hasSemanticSceneTarget({segmentStart: 0})).toBe(false)
    expect(hasSemanticSceneTarget({})).toBe(false)
  })
})

describe('pickFirstSeekableInTopN', () => {
  it('returns first seekable within top N and keeps later order for caller', () => {
    const playlist = [
      {id: 1, segmentStart: undefined},
      {id: 2, segmentStart: null},
      {id: 3, segmentStart: 42},
      {id: 4, segmentStart: 99},
    ]
    const picked = pickFirstSeekableInTopN(playlist, 5)
    expect(picked.startIndex).toBe(2)
    expect(picked.item?.id).toBe(3)
  })

  it('prefers tile-backed hits when segmentStart is missing', () => {
    const playlist = [
      {id: 1},
      {id: 2, semanticTileIndex: 8},
    ]
    const picked = pickFirstSeekableInTopN(playlist, 5)
    expect(picked.startIndex).toBe(1)
    expect(picked.item?.id).toBe(2)
  })

  it('falls back to first item when none seekable in top N', () => {
    const playlist = [
      {id: 1},
      {id: 2},
      {id: 3, segmentStart: 10},
    ]
    const picked = pickFirstSeekableInTopN(playlist, 2)
    expect(picked.startIndex).toBe(0)
    expect(picked.item?.id).toBe(1)
  })

  it('handles empty playlist', () => {
    expect(pickFirstSeekableInTopN([], 5)).toEqual({startIndex: 0, item: null})
  })
})

describe('countSeekableHits', () => {
  it('counts usable scene times', () => {
    expect(countSeekableHits([
      {time: null},
      {time: 0},
      {time: 3},
      {time: 8},
    ])).toBe(2)
  })
})
