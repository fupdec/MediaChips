import {beforeEach, describe, expect, it, vi} from 'vitest'

const {app, updateItem, updateMediaInfo, getMediaItems} = vi.hoisted(() => ({
  app: {dbPath: 'a', baseUrl: 'http://server-a'},
  updateItem: vi.fn(),
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

vi.mock('@/stores/items', () => ({useItemsStore: () => ({updateItem})}))
vi.mock('@/stores/app', () => ({useAppStore: () => app}))
vi.mock('@/services/apiClient', () => ({getApiBaseUrl: () => app.baseUrl}))

import {
  pickMediaFileInfo,
  refreshMediaFileInfo,
  refreshMediaFileInfoMany,
} from './mediaFileInfoService'

function response(id: number, filesize = id * 10) {
  return {data: {items: [{id, name: `media-${id}`, path: `/videos/${id}.mp4`, filesize}]}}
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return {promise, resolve}
}
beforeEach(() => {
  vi.resetAllMocks()
  app.dbPath = 'a'
  app.baseUrl = 'http://server-a'
  updateMediaInfo.mockResolvedValue({})
  getMediaItems.mockImplementation(async ({ids}) => response(ids[0]))
})

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


describe('file metadata refresh isolation', () => {
  it('shares overlapping refreshes in one library', async () => {
    const probe = deferred<{}>()
    updateMediaInfo.mockReturnValueOnce(probe.promise)
    const first = refreshMediaFileInfo(1)
    const second = refreshMediaFileInfo(1)
    expect(updateMediaInfo).toHaveBeenCalledTimes(1)
    probe.resolve({})
    expect(await first).toEqual(await second)
    expect(getMediaItems).toHaveBeenCalledTimes(1)
    expect(updateItem).toHaveBeenCalledTimes(1)
  })

  it.each(['library', 'server'])('separates refreshes when switching %s during a probe', async mode => {
    const old = deferred<{}>()
    updateMediaInfo.mockReturnValueOnce(old.promise)
    const first = refreshMediaFileInfo(1)
    if (mode === 'library') app.dbPath = 'b'
    else app.baseUrl = 'http://server-b'
    const fresh = await refreshMediaFileInfo(1)
    expect(fresh?.filesize).toBe(10)
    expect(updateMediaInfo).toHaveBeenCalledTimes(2)
    old.resolve({})
    expect(await first).toBeNull()
    expect(getMediaItems).toHaveBeenCalledTimes(1)
    expect(updateItem).toHaveBeenCalledTimes(1)
  })

  it('does not apply a metadata response from the previous library', async () => {
    const old = deferred<ReturnType<typeof response>>()
    getMediaItems.mockReturnValueOnce(old.promise)
    const first = refreshMediaFileInfo(1)
    await Promise.resolve()
    expect(getMediaItems).toHaveBeenCalledTimes(1)
    app.dbPath = 'b'
    old.resolve(response(1, 999))
    expect(await first).toBeNull()
    expect(updateItem).not.toHaveBeenCalled()
  })

  it('does not continue queued probes in a different library', async () => {
    const old = deferred<{}>()
    updateMediaInfo.mockReturnValueOnce(old.promise)
    const first = refreshMediaFileInfoMany([1, 2, 3], 1)
    app.dbPath = 'b'
    old.resolve({})
    expect(await first).toEqual([])
    expect(updateMediaInfo).toHaveBeenCalledTimes(1)
    expect(getMediaItems).not.toHaveBeenCalled()
  })

  it('deduplicates a serial batch and excludes invalid ids', async () => {
    expect(await refreshMediaFileInfoMany([1, 1, 2, 1, 0, -1, NaN, Infinity, 1.5], 1)).toEqual([1, 2])
    expect(updateMediaInfo).toHaveBeenCalledTimes(2)
  })

  it.each([0, -1, NaN, Infinity, 1.5])('does not probe invalid id %s', async id => {
    expect(await refreshMediaFileInfo(id)).toBeNull()
    expect(updateMediaInfo).not.toHaveBeenCalled()
  })
})
