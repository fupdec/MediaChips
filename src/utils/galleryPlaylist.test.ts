/**
 * @vitest-environment node
 */
import {beforeEach, describe, expect, it, vi} from 'vitest'

const {getMediaIds, getMediaBasics} = vi.hoisted(() => ({
  getMediaIds: vi.fn(),
  getMediaBasics: vi.fn(),
}))

vi.mock('@/services/typedApi', () => ({
  typedApi: {
    getMediaIds,
    getMediaBasics,
  },
}))

import {
  MEDIA_BASICS_CHUNK,
  fetchMediaBasicsByIds,
  keepPlaylistItemsForMediaType,
  mergeLoadedPlaylistItems,
  resolveGalleryPlaylistVideos,
  scopedPlaylistIds,
} from './galleryPlaylist'

function item(id: number, extra: Record<string, unknown> = {}) {
  return {id, mediaTypeId: 1, path: `/v/${id}.mp4`, name: `video-${id}`, ...extra}
}

describe('galleryPlaylist', () => {
  beforeEach(() => {
    getMediaIds.mockReset()
    getMediaBasics.mockReset()
  })

  it('keeps scoped ids unique and ordered', () => {
    expect(scopedPlaylistIds([2, '2', 0, 3, -1, 2, 'x'])).toEqual([2, 3])
  })

  it('overlays loaded gallery rows onto slim navigation items', () => {
    const merged = mergeLoadedPlaylistItems(
      [item(1), item(2, {duration: 9})],
      [item(2, {tags: [{id: 7}], duration: 12})],
    )
    expect(merged).toEqual([
      item(1),
      item(2, {tags: [{id: 7}], duration: 12}),
    ])
  })

  it('keeps rows for the current video media type', () => {
    expect(keepPlaylistItemsForMediaType(
      [item(1), item(2, {mediaTypeId: 9}), item(3, {mediaTypeId: null})],
      1,
    ).map((row) => row.id)).toEqual([1, 3])
  })

  it('loads basics in chunks and restores id order', async () => {
    const ids = Array.from({length: MEDIA_BASICS_CHUNK + 2}, (_, i) => i + 1)
    getMediaBasics.mockImplementation(async ({ids: chunk}: {ids: number[]}) => ({
      data: {items: [...chunk].reverse().map((id) => item(id))},
    }))

    const rows = await fetchMediaBasicsByIds(ids)
    expect(getMediaBasics).toHaveBeenCalledTimes(2)
    const sentSizes = getMediaBasics.mock.calls.map((call) => call[0].ids.length)
    expect(sentSizes.sort((a, b) => b - a)).toEqual([MEDIA_BASICS_CHUNK, 2])
    expect(rows.map((row) => row.id)).toEqual(ids)
  })

  it('does not expand a tag page into a media playlist', async () => {
    await expect(resolveGalleryPlaylistVideos({
      type: 'tag',
      entities: [item(1)],
      totalFiltered: 40,
    })).resolves.toBeNull()
    expect(getMediaIds).not.toHaveBeenCalled()
  })

  it('fetches the full filtered queue even when only one infinite-scroll page is loaded', async () => {
    const loaded = [item(1, {tags: [{id: 4}]})]
    const navigation = [item(1, {duration: 8}), item(2), item(3)]
    getMediaIds.mockResolvedValue({data: {ids: [1, 2, 3], navigation}})

    const result = await resolveGalleryPlaylistVideos({
      type: 'media',
      mediaTypeId: 1,
      filters: [{id: 1, param: 'rating', type: 'number', cond: '>=', val: 4, note: null, active: true, lock: false}],
      filtersJoin: 'or',
      sortBy: 'name',
      sortDir: 'asc',
      find_duplicates: true,
      duplicatesBy: 'fingerprint',
      entities: loaded,
      totalFiltered: 1,
    })

    expect(getMediaIds).toHaveBeenCalledWith({
      mediaTypeId: 1,
      filters: [{id: 1, param: 'rating', type: 'number', cond: '>=', val: 4, note: null, active: true, lock: false}],
      filtersJoin: 'or',
      sortBy: 'name',
      direction: 'asc',
      find_duplicates: true,
      duplicates_by: 'fingerprint',
      includeNavigation: true,
      skipTotals: true,
    })
    expect(result?.map((row) => row.id)).toEqual([1, 2, 3])
    expect(result?.[0]).toEqual(item(1, {tags: [{id: 4}]}))
    expect(getMediaBasics).not.toHaveBeenCalled()
  })

  it('uses loaded rows when they already cover the id list', async () => {
    const entities = [item(2), item(1)]
    getMediaIds.mockResolvedValue({data: {ids: [1, 2], navigation: []}})

    const result = await resolveGalleryPlaylistVideos({
      type: 'media',
      mediaTypeId: 1,
      entities,
      totalFiltered: 2,
    })

    expect(result?.map((row) => row.id)).toEqual([1, 2])
    expect(result?.[0]).toBe(entities[1])
    expect(getMediaBasics).not.toHaveBeenCalled()
  })

  it('hydrates a scoped list from ids instead of the library filter', async () => {
    getMediaBasics.mockResolvedValue({
      data: {items: [item(30), item(10), item(20)]},
    })

    const result = await resolveGalleryPlaylistVideos({
      type: 'media',
      mediaTypeId: 1,
      listScopeIds: [10, 20, 30],
      entities: [item(10, {favorite: true})],
      totalFiltered: 3,
    })

    expect(getMediaIds).not.toHaveBeenCalled()
    expect(getMediaBasics).toHaveBeenCalledWith({ids: [10, 20, 30]})
    expect(result?.map((row) => row.id)).toEqual([10, 20, 30])
    expect(result?.[0]).toEqual(item(10, {favorite: true}))
  })

  it('hydrates by ids when the ids endpoint omits navigation', async () => {
    getMediaIds.mockResolvedValue({data: {ids: [4, 5]}})
    getMediaBasics.mockResolvedValue({data: {items: [item(5), item(4)]}})

    const result = await resolveGalleryPlaylistVideos({
      type: 'media',
      mediaTypeId: 1,
      entities: [item(4)],
      totalFiltered: 1,
    })

    expect(getMediaBasics).toHaveBeenCalledWith({ids: [4, 5]})
    expect(result?.map((row) => row.id)).toEqual([4, 5])
  })

  it('retries with ids-only and hydrates if navigation query fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    getMediaIds
      .mockRejectedValueOnce(new Error('no such column: videoMetadata.duration'))
      .mockResolvedValueOnce({data: {ids: [8, 9]}})
    getMediaBasics.mockResolvedValue({data: {items: [item(9), item(8)]}})

    const result = await resolveGalleryPlaylistVideos({
      type: 'media',
      mediaTypeId: 1,
      entities: [item(8)],
      totalFiltered: 1,
    })

    expect(getMediaIds).toHaveBeenCalledTimes(2)
    expect(getMediaIds.mock.calls[1][0].includeNavigation).toBe(false)
    expect(result?.map((row) => row.id)).toEqual([8, 9])
    warn.mockRestore()
  })

  it('falls back to the page window when the filtered fetch fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    getMediaIds.mockRejectedValue(new Error('offline'))
    await expect(resolveGalleryPlaylistVideos({
      type: 'media',
      entities: [item(1)],
      totalFiltered: 80,
    })).resolves.toBeNull()
    warn.mockRestore()
  })
})
