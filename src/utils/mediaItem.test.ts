import {describe, it, expect} from 'vitest'
import {
  getSegmentStart,
  getSegmentEnd,
  isClipPlaylistItem,
  mergeClipFields,
  playlistItemKey,
} from '@/utils/mediaItem'

describe('getSegmentStart', () => {
  it('reads segmentStart and coerces numeric strings', () => {
    expect(getSegmentStart({id: 1, segmentStart: 12, time: 99})).toBe(12)
    expect(getSegmentStart({id: 1, segmentStart: '641' as unknown as number})).toBe(641)
  })

  it('never uses resume time as clip start', () => {
    expect(getSegmentStart({id: 1, markId: 7, time: 486})).toBeUndefined()
  })
})

describe('getSegmentEnd', () => {
  it('reads segmentEnd', () => {
    expect(getSegmentEnd({id: 1, segmentEnd: 20})).toBe(20)
  })
})

describe('isClipPlaylistItem', () => {
  it('detects clips by markId or segment bounds', () => {
    expect(isClipPlaylistItem({id: 1, markId: 3})).toBe(true)
    expect(isClipPlaylistItem({id: 1, segmentStart: 10, segmentEnd: 20})).toBe(true)
    expect(isClipPlaylistItem({id: 1, path: '/a.mp4'})).toBe(false)
  })
})

describe('mergeClipFields', () => {
  it('preserves clip bounds when the resolved media row lost them', () => {
    const merged = mergeClipFields(
      {id: 1, path: '/a.mp4', time: 486},
      {id: 1, markId: 9, segmentStart: 641, segmentEnd: 787, key: 'clip-9'},
    )
    expect(merged.segmentStart).toBe(641)
    expect(merged.segmentEnd).toBe(787)
    expect(merged.markId).toBe(9)
    expect(merged.key).toBe('clip-9')
  })
})

describe('playlistItemKey', () => {
  it('uses markId for clip identity', () => {
    expect(playlistItemKey({id: 1, markId: 9})).toBe('clip-9')
  })
})
