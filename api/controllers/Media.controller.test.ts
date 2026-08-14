import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ApiRequest, ApiResponse } from '../types/http'

const {
  findById,
  updateById,
  deleteById,
  findByZipArchivePrefix,
  getStats,
  countWithTag,
  findMediaTypeById,
  loadMediaItems,
  loadFilteredMediaIds,
  loadMediaBasicsByIds,
  deleteMediaGeneratedAssets,
  unlinkResolvedPath,
  invalidateMediaDerivedCaches,
  mapWithConcurrency,
  readFirstExistingImageDataUrl,
} = vi.hoisted(() => ({
  findById: vi.fn(),
  updateById: vi.fn(),
  deleteById: vi.fn(),
  findByZipArchivePrefix: vi.fn(),
  getStats: vi.fn(),
  countWithTag: vi.fn(),
  findMediaTypeById: vi.fn(),
  loadMediaItems: vi.fn(),
  loadFilteredMediaIds: vi.fn(),
  loadMediaBasicsByIds: vi.fn(),
  deleteMediaGeneratedAssets: vi.fn(),
  unlinkResolvedPath: vi.fn(),
  invalidateMediaDerivedCaches: vi.fn(),
  mapWithConcurrency: vi.fn(),
  readFirstExistingImageDataUrl: vi.fn(),
}))

vi.mock('../db/repositories/media', () => ({
  createMediaRepository: () => ({
    findById,
    updateById,
    deleteById,
    findByZipArchivePrefix,
    getStats,
    countWithTag,
  }),
}))

vi.mock('../db/repositories/mediaTypes', () => ({
  createMediaTypesRepository: () => ({
    findById: findMediaTypeById,
  }),
}))

vi.mock('../services/mediaItemsLoader', () => ({
  loadMediaItems,
  loadFilteredMediaIds,
  loadMediaBasicsByIds,
}))

vi.mock('../services/localAssetCleanup', () => ({
  deleteMediaGeneratedAssets,
  unlinkResolvedPath,
}))

vi.mock('../services/mediaCacheInvalidation', () => ({
  invalidateMediaDerivedCaches,
}))

vi.mock('../services/thumbEncoding', () => ({
  mapWithConcurrency: (...args: unknown[]) => mapWithConcurrency(...args),
  readFirstExistingImageDataUrl,
}))

import createMediaController from './Media.controller'

function createResponse() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code
      return res
    },
    send(payload: unknown) {
      res.body = payload
      return res
    },
    sendStatus(code: number) {
      res.statusCode = code
      return res
    },
  }

  return res as ApiResponse & {statusCode: number; body: unknown}
}

describe('Media.controller', () => {
  const db = {drizzle: {}, path: '/tmp/db'} as never
  const controller = createMediaController(db)

  beforeEach(() => {
    vi.clearAllMocks()
    deleteMediaGeneratedAssets.mockResolvedValue(undefined)
    unlinkResolvedPath.mockResolvedValue(true)
  })

  it('loads media items with pagination and navigation flags', async () => {
    loadMediaItems.mockResolvedValue({items: [{id: 1}], total: 1})

    const req = {
      body: {
        mediaTypeId: 2,
        ids: [10, 11],
        page: 3,
        limit: 50,
        sortBy: 'rating',
        direction: 'desc',
        includeNavigation: true,
        skipTotals: true,
      },
    } as ApiRequest
    const res = createResponse()

    await controller.getAll(req, res)

    expect(loadMediaItems).toHaveBeenCalledWith(db, {
      mediaTypeId: 2,
      ids: [10, 11],
      filters: undefined,
      filtersJoin: 'and',
      sortBy: 'rating',
      direction: 'desc',
      find_duplicates: undefined,
      duplicates_by: 'filesize',
      page: 3,
      limit: 50,
      includeNavigation: false,
      skipTotals: true,
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({items: [{id: 1}], total: 1})
  })

  it('returns filtered media ids', async () => {
    loadFilteredMediaIds.mockResolvedValue({ids: [1, 2, 3]})

    const req = {
      body: {
        mediaTypeId: 4,
        find_duplicates: true,
        duplicates_by: 'path',
      },
    } as ApiRequest
    const res = createResponse()

    await controller.getFilteredIds(req, res)

    expect(loadFilteredMediaIds).toHaveBeenCalledWith(db, {
      mediaTypeId: 4,
      filters: undefined,
      filtersJoin: 'and',
      sortBy: undefined,
      direction: undefined,
      find_duplicates: true,
      duplicates_by: 'path',
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ids: [1, 2, 3]})
  })

  it('returns media stats from the repository', async () => {
    getStats.mockReturnValue({total: 10, size: 1024})

    const req = {} as ApiRequest
    const res = createResponse()

    await controller.getStats(req, res)

    expect(getStats).toHaveBeenCalledWith(db)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({total: 10, size: 1024})
  })

  it('updates media path fields and invalidates caches', () => {
    const req = {
      body: {
        id: 9,
        path: '/media/movies/clip.mp4',
      },
    } as ApiRequest
    const res = createResponse()

    controller.updatePath(req, res)

    expect(updateById).toHaveBeenCalledWith(9, {
      path: '/media/movies/clip.mp4',
      basename: 'clip.mp4',
      name: 'clip',
      ext: '.mp4',
    }, {silent: true})
    expect(invalidateMediaDerivedCaches).toHaveBeenCalled()
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual([1])
  })

  it('returns 404 when deleting missing media', async () => {
    findById.mockReturnValue(null)

    const req = {body: {id: 77}} as ApiRequest
    const res = createResponse()

    await controller.deleteOne(req, res)

    expect(res.statusCode).toBe(404)
    expect(res.body).toEqual({message: 'Media not found.'})
    expect(deleteById).not.toHaveBeenCalled()
  })

  it('deletes generated assets, optional file, and database row', async () => {
    findById.mockReturnValue({
      id: 5,
      mediaTypeId: 2,
      path: '/media/movies/clip.mp4',
    })
    findMediaTypeById.mockReturnValue({type: 'videos'})

    const req = {
      body: {
        id: 5,
        with_file: true,
        permanent: true,
      },
    } as ApiRequest
    const res = createResponse()

    await controller.deleteOne(req, res)

    expect(deleteMediaGeneratedAssets).toHaveBeenCalledWith(
      db,
      '/tmp/db',
      expect.objectContaining({id: 5}),
      'videos',
    )
    expect(unlinkResolvedPath).toHaveBeenCalledWith('/media/movies/clip.mp4')
    expect(deleteById).toHaveBeenCalledWith(5)
    expect(invalidateMediaDerivedCaches).toHaveBeenCalled()
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({deletedIds: [5], softDeleted: false, zipFileDeleted: false})
  })

  it('deletes entire ZIP gallery when delete_zip_gallery is set', async () => {
    findById.mockReturnValue({
      id: 5,
      mediaTypeId: 2,
      path: '/media/album.zip!/a.jpg',
    })
    findMediaTypeById.mockReturnValue({type: 'image'})
    findByZipArchivePrefix.mockReturnValue([
      {id: 5, mediaTypeId: 2, path: '/media/album.zip!/a.jpg'},
      {id: 6, mediaTypeId: 2, path: '/media/album.zip!/b.jpg'},
    ])

    const req = {
      body: {
        id: 5,
        delete_zip_gallery: true,
      },
    } as ApiRequest
    const res = createResponse()

    await controller.deleteOne(req, res)

    expect(findByZipArchivePrefix).toHaveBeenCalledWith('/media/album.zip')
    expect(deleteById).toHaveBeenCalledWith(5)
    expect(deleteById).toHaveBeenCalledWith(6)
    expect(unlinkResolvedPath).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({deletedIds: [5, 6], softDeleted: false, zipFileDeleted: false})
  })

  it('deletes ZIP archive from disk when delete_zip_file is set', async () => {
    findById.mockReturnValue({
      id: 5,
      mediaTypeId: 2,
      path: '/media/album.zip!/a.jpg',
    })
    findMediaTypeById.mockReturnValue({type: 'image'})
    findByZipArchivePrefix.mockReturnValue([
      {id: 5, mediaTypeId: 2, path: '/media/album.zip!/a.jpg'},
    ])

    const req = {
      body: {
        id: 5,
        delete_zip_gallery: true,
        delete_zip_file: true,
      },
    } as ApiRequest
    const res = createResponse()

    await controller.deleteOne(req, res)

    expect(unlinkResolvedPath).toHaveBeenCalledWith('/media/album.zip')
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({deletedIds: [5], softDeleted: false, zipFileDeleted: true})
  })

  it('counts media linked to a tag', () => {
    countWithTag.mockReturnValue(12)

    const req = {
      query: {
        tagId: '8',
      },
    } as unknown as ApiRequest
    const res = createResponse()

    controller.numberOfMediaWithTag(req, res)

    expect(countWithTag).toHaveBeenCalledWith('8')
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({count: 12})
  })
})
