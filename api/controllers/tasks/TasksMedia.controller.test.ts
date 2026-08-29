/**
 * @vitest-environment node
 */
import {beforeEach, describe, expect, it, vi} from 'vitest'
import type {ApiRequest, ApiResponse} from '../../types/http'

const {
  findMediaById,
  updateById,
  findMediaTypeById,
  refreshMediaInfo,
  fileExists,
  resolveExistingPath,
  statSync,
} = vi.hoisted(() => ({
  findMediaById: vi.fn(),
  updateById: vi.fn(),
  findMediaTypeById: vi.fn(),
  refreshMediaInfo: vi.fn(),
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
