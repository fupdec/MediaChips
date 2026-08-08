import {describe, expect, it, vi} from 'vitest'
import {loadTagAppearancesForPlayback} from './tagAppearancesPlayback'
import type {FaceAppearanceItem} from '@shared/api/responses'

function appearance(faceId: number): FaceAppearanceItem {
  return {
    id: faceId * 10,
    faceId,
    key: `face-${faceId}`,
    path: `/${faceId}.mp4`,
    segmentStart: faceId,
  }
}

describe('loadTagAppearancesForPlayback', () => {
  it('returns empty when there are no appearances', async () => {
    const fetchAppearances = vi.fn(async () => ({items: [], count: 0}))

    await expect(loadTagAppearancesForPlayback(fetchAppearances, 7)).resolves.toEqual({
      empty: true,
      count: 0,
      first: null,
      playlist: [],
    })
    expect(fetchAppearances).toHaveBeenCalledWith({tagId: 7, sort: 'time', limit: 1})
  })

  it('skips the remainder fetch when count is 1', async () => {
    const first = appearance(1)
    const fetchAppearances = vi.fn(async () => ({items: [first], count: 1}))

    const result = await loadTagAppearancesForPlayback(fetchAppearances, 7)

    expect(result).toEqual({
      empty: false,
      count: 1,
      first,
      playlist: [first],
    })
    expect(fetchAppearances).toHaveBeenCalledTimes(1)
  })

  it('fills the playlist with offset:1 instead of re-fetching the head', async () => {
    const first = appearance(1)
    const rest = [appearance(2), appearance(3)]
    const fetchAppearances = vi.fn(async (body: {limit?: number; offset?: number}) => {
      if (body.limit === 1) return {items: [first], count: 3}
      if (body.offset === 1) return {items: rest, count: 3}
      throw new Error(`unexpected fetch ${JSON.stringify(body)}`)
    })

    const result = await loadTagAppearancesForPlayback(fetchAppearances, 7)

    expect(result.playlist).toEqual([first, ...rest])
    expect(fetchAppearances).toHaveBeenCalledTimes(2)
    expect(fetchAppearances).toHaveBeenNthCalledWith(2, {
      tagId: 7,
      sort: 'time',
      offset: 1,
    })
  })
})
