/**
 * @vitest-environment node
 */
import {beforeEach, describe, expect, it, vi} from 'vitest'
import type {ApiRequest, ApiResponse} from '../../types/http'

const {
  findMediaById,
  findByIds,
  updateById,
  findMediaTypeById,
  refreshMediaInfo,
  ensureMediaMetadata,
  fileExists,
  resolveExistingPath,
  statSync,
} = vi.hoisted(() => ({
  findMediaById: vi.fn(),
  findByIds: vi.fn(),
  updateById: vi.fn(),
  findMediaTypeById: vi.fn(),
  refreshMediaInfo: vi.fn(),
  ensureMediaMetadata: vi.fn(),
  fileExists: vi.fn(),
  resolveExistingPath: vi.fn(),
  statSync: vi.fn(),
}))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    default: {
      ...actual,
      statSync,
    },
    statSync,
  }
})

vi.mock('../../db/repositories/media', () => ({
  createMediaRepository: () => ({
    findById: findMediaById,
    findByIds,
    updateById,
    findByPathVariants: vi.fn(),
    findByBasenameFilesizeAndMediaType: vi.fn(),
    findByContentHash: vi.fn(),
    findByOshash: vi.fn(),
    create: vi.fn(),
  }),
}))

vi.mock('../../db/repositories/mediaTypes', () => ({
  createMediaTypesRepository: () => ({
    findById: findMediaTypeById,
  }),
}))

vi.mock('../../services/mediaPostProcess', () => ({
  createMediaPostProcessor: () => ({
    refreshMediaInfo,
    processNewMedia: vi.fn(),
    ensureImageDimensions: vi.fn(),
    ensureMediaMetadata,
  }),
}))

vi.mock('../../services/contentHash', () => ({
  fileExists,
  resolveExistingPath,
}))

vi.mock('../../services/zipGallery', () => ({
  isVirtualZipPath: () => false,
  getZipEntryInfo: vi.fn(),
}))

import createTasksMediaController from './TasksMedia.controller'

function createShared() {
  return {
    db: {drizzle: {}, path: '/tmp/db'},
    dbPath: '/tmp/db',
    withTimeout: <T>(promise: Promise<T>) => promise,
    getParserSettings: vi.fn(),
    getImageMedia: vi.fn(),
    createThumbMiddle: vi.fn(),
    createAudioThumb: vi.fn(),
  } as never
}

function createResponse() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code
      return this
    },
    send(payload: unknown) {
      this.body = payload
      return this
    },
  }
  return res as typeof res & ApiResponse
}

describe('TasksMedia.controller updateMediaInfo', () => {
  const controller = createTasksMediaController(createShared())

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('skips refresh when the source file is missing', async () => {
    findMediaById.mockReturnValue({
      id: 22809,
      path: '/missing/video.mp4',
      mediaTypeId: 1,
    })
    fileExists.mockResolvedValue(false)

    const req = {body: {id: 22809}} as ApiRequest
    const res = createResponse()

    await controller.updateMediaInfo(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toBe('success')
    expect(refreshMediaInfo).not.toHaveBeenCalled()
    expect(updateById).not.toHaveBeenCalled()
  })

  it('refreshes metadata when the source file exists', async () => {
    const media = {
      id: 22810,
      path: '/available/video.mp4',
      mediaTypeId: 1,
    }
    findMediaById.mockReturnValue(media)
    findMediaTypeById.mockReturnValue({id: 1, type: 'video'})
    fileExists.mockResolvedValue(true)
    resolveExistingPath.mockResolvedValue('/available/video.mp4')
    refreshMediaInfo.mockResolvedValue(undefined)
    statSync.mockReturnValue({size: 1234})

    const req = {body: {id: 22810}} as ApiRequest
    const res = createResponse()

    await controller.updateMediaInfo(req, res)

    expect(res.statusCode).toBe(200)
    expect(refreshMediaInfo).toHaveBeenCalledWith(media, {id: 1, type: 'video'})
    expect(updateById).toHaveBeenCalledWith(22810, {filesize: 1234})
  })
})

describe('TasksMedia.controller ensureMediaMetadataBulk', () => {
  const controller = createTasksMediaController(createShared())

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('probes a batch and returns metadata items', async () => {
    findByIds.mockReturnValue([
      {id: 1, path: '/a.jpg', mediaTypeId: 2, filesize: 10},
      {id: 2, path: '/b.mp4', mediaTypeId: 1, filesize: 20},
    ])
    findMediaTypeById.mockImplementation((id: number) => (
      id === 2 ? {id: 2, type: 'image'} : {id: 1, type: 'video'}
    ))
    fileExists.mockResolvedValue(true)
    resolveExistingPath.mockImplementation(async (p: string) => p)
    statSync.mockReturnValue({size: 99})
    ensureMediaMetadata.mockImplementation(async (media: {id: number}) => ({
      id: media.id,
      width: 100,
      height: 50,
      duration: media.id === 2 ? 12 : 0,
      filesize: 99,
    }))

    const req = {body: {ids: [1, 2, 2]}} as ApiRequest
    const res = createResponse()
    await controller.ensureMediaMetadataBulk(req, res)

    expect(res.statusCode).toBe(200)
    expect(ensureMediaMetadata).toHaveBeenCalledTimes(2)
    expect(res.body).toEqual({
      items: [
        {id: 1, width: 100, height: 50, duration: 0, filesize: 99},
        {id: 2, width: 100, height: 50, duration: 12, filesize: 99},
      ],
    })
  })
})
