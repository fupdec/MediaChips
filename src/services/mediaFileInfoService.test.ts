import {beforeEach, describe, expect, it, vi} from 'vitest'

const {updateMediaInfo, getMediaItems} = vi.hoisted(() => ({
  updateMediaInfo: vi.fn(async () => ({})),
  getMediaItems: vi.fn(async ({ids}: {ids: number[]}) => ({
    data: {
      items: ids.map((id) => ({
        id,
        name: `media-${id}`,
        path: `/videos/${id}.mp4`,
        filesize: id * 10,
      })),
    },
  })),
}))

vi.mock('@/services/typedApi', () => ({
  typedApi: {
    updateMediaInfo,
    getMediaItems,
  },
}))

vi.mock('@/stores/dialogs', () => ({
  useDialogsStore: () => ({
    mediaEditing: {show: false, media: null},
  }),
}))

vi.mock('@/stores/items', () => ({
  useItemsStore: () => ({
    updateItem: vi.fn(),
  }),
}))

import {
  pickMediaFileInfo,
  refreshMediaFileInfoMany,
} from './mediaFileInfoService'

describe('pickMediaFileInfo', () => {
  it('keeps only file metadata fields', () => {
    expect(pickMediaFileInfo({
      id: 1,
      name: 'clip',
      path: '/videos/clip.mp4',
      basename: 'clip.mp4',
      ext: 'mp4',
      filesize: 1024,
      duration: 90,
      width: 1920,
      height: 1080,
      codec: 'h264',
      bitrate: 8000000,
      fps: 24,
      orientation: 1,
      rating: 5,
      tags: [{tagId: 7}],
    })).toEqual({
      name: 'clip',
      path: '/videos/clip.mp4',
      basename: 'clip.mp4',
      ext: 'mp4',
      filesize: 1024,
      duration: 90,
      width: 1920,
      height: 1080,
      codec: 'h264',
      bitrate: 8000000,
      fps: 24,
      orientation: 1,
    })
  })
})

describe('refreshMediaFileInfoMany', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('refreshes ids with bounded concurrency and returns successes', async () => {
    let inFlight = 0
    let maxInFlight = 0
    updateMediaInfo.mockImplementation(async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight -= 1
      return {}
    })

    const updated = await refreshMediaFileInfoMany([1, 2, 3, 4], 2)
    expect(updated).toEqual([1, 2, 3, 4])
    expect(maxInFlight).toBeLessThanOrEqual(2)
    expect(maxInFlight).toBeGreaterThan(1)
    expect(updateMediaInfo).toHaveBeenCalledTimes(4)
  })
})
