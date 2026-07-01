import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AxiosResponse } from 'axios'
import { API_ROUTES } from '@shared/api/routes'

vi.mock('./apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

import { apiClient } from './apiClient'
import { typedApi } from './typedApi'

const mockGet = vi.mocked(apiClient.get)
const mockPost = vi.mocked(apiClient.post)

function mockAxiosResponse<T>(data: T): AxiosResponse<T> {
  return { data, status: 200, statusText: 'OK', headers: {}, config: {} as AxiosResponse['config'] }
}

describe('typedApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('validates bootstrap media types', async () => {
    mockGet.mockResolvedValue(mockAxiosResponse([
      { id: 1, type: 'video', name: 'Videos' },
    ]))

    const response = await typedApi.getMediaTypes()

    expect(mockGet).toHaveBeenCalledWith(API_ROUTES.mediaType)
    expect(response.data[0]?.id).toBe(1)
  })

  it('loads extended api modules on first extended call', async () => {
    mockGet.mockResolvedValue(mockAxiosResponse({ total: 42, filesize: 1024 }))

    const response = await typedApi.getMediaStats()

    expect(mockGet).toHaveBeenCalledWith(API_ROUTES.mediaGetStats)
    expect(response.data.total).toBe(42)
  })

  it('validates saved filters list', async () => {
    mockGet.mockResolvedValue(mockAxiosResponse([
      { id: 7, name: 'My filter' },
    ]))

    const response = await typedApi.getSavedFilters()

    expect(mockGet).toHaveBeenCalledWith(API_ROUTES.savedFilter)
    expect(response.data[0]?.name).toBe('My filter')
  })

  it('validates task file list', async () => {
    mockPost.mockResolvedValue(mockAxiosResponse(['/videos/a.mp4']))

    const response = await typedApi.getFileList({ path: '/videos' })

    expect(mockPost).toHaveBeenCalledWith(API_ROUTES.taskGetFileList, { path: '/videos' })
    expect(response.data).toEqual(['/videos/a.mp4'])
  })

  it('falls back when bootstrap validation fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockGet.mockResolvedValue(mockAxiosResponse([{ id: 'invalid' }]))

    const response = await typedApi.getMediaTypes()

    expect(warn).toHaveBeenCalled()
    expect(response.data[0]?.id).toBe('invalid')
    warn.mockRestore()
  })

  it('validates page settings fetch tuple', async () => {
    mockPost.mockResolvedValue(mockAxiosResponse([
      { page: 1, limit: 24 },
      true,
    ]))

    const response = await typedApi.fetchPageSettings({ mediaTypeId: 1 })

    expect(mockPost).toHaveBeenCalledWith(API_ROUTES.pageSetting, { mediaTypeId: 1 })
    expect(response.data[0]?.page).toBe(1)
    expect(response.data[1]).toBe(true)
  })

  it('validates playlist create response', async () => {
    mockPost.mockResolvedValue(mockAxiosResponse({ id: 9, name: 'New list' }))

    const response = await typedApi.createPlaylist({ name: 'New list' })

    expect(response.data.id).toBe(9)
    expect(response.data.name).toBe('New list')
  })

  it('validates playlist media links', async () => {
    mockGet.mockResolvedValue(mockAxiosResponse([
      { mediaId: 10, playlistId: 2, order: 1 },
    ]))

    const response = await typedApi.getMediaInPlaylist(2)

    expect(response.data[0]?.mediaId).toBe(10)
  })

  it('validates meta by id', async () => {
    mockGet.mockResolvedValue(mockAxiosResponse({ id: 3, name: 'Studio', type: 'array' }))

    const response = await typedApi.getMetaById(3)

    expect(response.data.name).toBe('Studio')
  })

  it('validates marks for video', async () => {
    mockGet.mockResolvedValue(mockAxiosResponse([{ id: 1, type: 'meta', time: 30, mediaId: 5 }]))

    const response = await typedApi.getMarksForVideo(5)

    expect(response.data[0]?.time).toBe(30)
  })

  it('validates create mark response', async () => {
    mockPost.mockResolvedValue(mockAxiosResponse({ id: 9, type: 'favorite', time: 12, mediaId: 5 }))

    const response = await typedApi.createMark({ type: 'favorite', time: 12, mediaId: 5 })

    expect(response.data.id).toBe(9)
    expect(response.data.type).toBe('favorite')
  })

  it('validates create meta and setting write responses', async () => {
    mockPost.mockResolvedValue(mockAxiosResponse({ id: 8, name: 'Studio', type: 'array' }))
    const meta = await typedApi.createMeta({ name: 'Studio', type: 'array' })
    expect(meta.data.id).toBe(8)

    mockGet.mockResolvedValue(mockAxiosResponse({ option: 'theme', value: 'dark' }))
    const setting = await typedApi.getSetting('theme')
    expect(setting.data.value).toBe('dark')
  })

  it('validates database sizes and watched folders', async () => {
    mockPost.mockResolvedValue(mockAxiosResponse({ sizes: { main: 4096 } }))
    const sizes = await typedApi.getDatabaseSizes({ ids: ['main'] })
    expect(sizes.data.sizes?.main).toBe(4096)

    mockGet.mockResolvedValue(mockAxiosResponse([
      {
        folderId: 1,
        mediaType: { id: 2, type: 'video' },
        watchedFolder: { path: '/videos' },
      },
    ]))
    const folders = await typedApi.getMediaTypesInWatchedFolders()
    expect(folders.data[0]?.folderId).toBe(1)
  })

  it('validates search media by path and add media', async () => {
    mockPost.mockResolvedValueOnce(mockAxiosResponse([
      { id: 3, path: '/media/clip.mp4' },
    ]))
    const search = await typedApi.searchMediaByPath({ query: 'clip' })
    expect(search.data[0]?.id).toBe(3)

    mockPost.mockResolvedValueOnce(mockAxiosResponse({ id: 99, name: 'clip.mp4' }))
    const added = await typedApi.addMedia({ path: '/media/clip.mp4' })
    expect(added.data.id).toBe(99)
  })

  it('validates parse path tags', async () => {
    mockPost.mockResolvedValue(mockAxiosResponse([
      { mediaId: 4, tagId: 9, metaId: 2 },
    ]))

    const response = await typedApi.parsePathTags({ paths: [{ path: '/a.mp4', mediaId: 4 }] })
    expect(response.data[0]?.tagId).toBe(9)
  })

  it('validates meta setting and sql search rows', async () => {
    mockGet.mockResolvedValue(mockAxiosResponse({ isLink: true, ratingMax: 10 }))
    const setting = await typedApi.getMetaSetting(5)
    expect(setting.data.isLink).toBe(true)
    expect(setting.data.ratingMax).toBe(10)

    mockPost.mockResolvedValueOnce(mockAxiosResponse({
      items: [{ id: 1, name: 'clip.mp4', mediaTypeId: 2, path: '/clip.mp4' }],
    }))
    const media = await typedApi.searchMedia({ q: 'clip' })
    expect(media.data[0]?.name).toBe('clip.mp4')
    expect(media.data[0]?.mediaTypeId).toBe(2)

    mockPost.mockResolvedValueOnce(mockAxiosResponse({
      items: [{
        id: 3,
        name: 'Actor',
        metaId: 1,
      }],
    }))
    const tags = await typedApi.searchTags({ q: 'Actor' })
    expect(tags.data[0]?.metaId).toBe(1)
    expect(tags.data[0]?.name).toBe('Actor')

    mockPost.mockResolvedValueOnce(mockAxiosResponse({
      media: [{ id: 1, name: 'clip.mp4', mediaTypeId: 2, path: '/clip.mp4' }],
      tags: [{ id: 3, name: 'Actor', metaId: 1 }],
    }))
    const combined = await typedApi.searchGlobal({ q: 'clip' })
    expect(combined.data.media[0]?.name).toBe('clip.mp4')
    expect(combined.data.tags[0]?.name).toBe('Actor')
  })

  it('validates video playable info', async () => {
    mockGet.mockResolvedValue(mockAxiosResponse({
      mode: 'stream',
      transcodeRequired: true,
      streamPlayback: true,
    }))

    const response = await typedApi.getVideoPlayable(12)
    expect(mockGet).toHaveBeenCalledWith('/api/video/12/playable')
    expect(response.data.transcodeRequired).toBe(true)
  })

  it('validates transcode cache stats', async () => {
    mockGet.mockResolvedValue(mockAxiosResponse({ bytes: 4096, files: 2, entries: 2 }))

    const response = await typedApi.getTranscodeCacheStats()
    expect(mockGet).toHaveBeenCalledWith(API_ROUTES.transcodeCache)
    expect(response.data.bytes).toBe(4096)
  })
})
