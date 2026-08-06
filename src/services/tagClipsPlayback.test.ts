import {describe, expect, it, vi} from 'vitest'
import {loadTagClipsForPlayback} from './tagClipsPlayback'
import type {MarkClipItem} from '@shared/api/responses'

function clip(markId: number): MarkClipItem {
  return {
    id: markId * 10,
    markId,
    path: `/${markId}.mp4`,
    segmentStart: markId,
    segmentEnd: markId + 1,
  }
}

describe('loadTagClipsForPlayback', () => {
  it('returns empty when there are no clips', async () => {
    const fetchClips = vi.fn(async () => ({items: [], count: 0}))

    await expect(loadTagClipsForPlayback(fetchClips, 7)).resolves.toEqual({
      empty: true,
      count: 0,
      first: null,
      playlist: [],
    })
    expect(fetchClips).toHaveBeenCalledTimes(1)
    expect(fetchClips).toHaveBeenCalledWith({tagId: 7, sort: 'time', limit: 1})
  })

  it('skips the remainder fetch when count is 1', async () => {
    const first = clip(1)
    const fetchClips = vi.fn(async () => ({items: [first], count: 1}))

    const result = await loadTagClipsForPlayback(fetchClips, 7)

    expect(result).toEqual({
      empty: false,
      count: 1,
      first,
      playlist: [first],
    })
    expect(fetchClips).toHaveBeenCalledTimes(1)
  })

  it('fills the playlist with offset:1 instead of re-fetching the head', async () => {
    const first = clip(1)
    const rest = [clip(2), clip(3)]
    const fetchClips = vi.fn(async (body: {limit?: number; offset?: number}) => {
      if (body.limit === 1) return {items: [first], count: 3}
      if (body.offset === 1) return {items: rest, count: 3}
      throw new Error(`unexpected fetch ${JSON.stringify(body)}`)
    })

    const result = await loadTagClipsForPlayback(fetchClips, 7)

    expect(result.playlist).toEqual([first, ...rest])
    expect(fetchClips).toHaveBeenCalledTimes(2)
    expect(fetchClips).toHaveBeenNthCalledWith(2, {
      tagId: 7,
      sort: 'time',
      offset: 1,
    })
  })
})
