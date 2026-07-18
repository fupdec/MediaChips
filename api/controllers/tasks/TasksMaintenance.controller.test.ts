import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ApiRequest, ApiResponse } from '../../types/http'

const {
  getContentHashBackfillStatus,
  getMissingMediaStatus,
  updateById,
} = vi.hoisted(() => ({
  getContentHashBackfillStatus: vi.fn(),
  getMissingMediaStatus: vi.fn(),
  updateById: vi.fn(),
}))

vi.mock('../../services/mediaFingerprintBackfill', () => ({
  getContentHashBackfillStatus,
  getOshashBackfillStatus: vi.fn(),
  getFingerprintBackfillStatus: vi.fn(),
  iterateContentHashBackfill: vi.fn(),
  iterateOshashBackfill: vi.fn(),
  iterateFingerprintBackfill: vi.fn(),
}))

vi.mock('../../services/videoCodecBackfill', () => ({
  getVideoCodecBackfillStatus: vi.fn(),
  iterateVideoCodecBackfill: vi.fn(),
}))

vi.mock('../../services/missingMediaFinder', () => ({
  getMissingMediaStatus,
  iterateMissingMediaSearch: vi.fn(),
}))

vi.mock('../../services/imageThumbsGeneration', () => ({
  getImageThumbsGenerationStatus: vi.fn(),
  iterateImageThumbsGeneration: vi.fn(),
}))

vi.mock('../../db/repositories/media', () => ({
  createMediaRepository: () => ({
    updateById,
  }),
}))

import createTasksMaintenanceController from './TasksMaintenance.controller'

function createShared() {
  return {
    db: {drizzle: {}, path: '/tmp/db'},
    getDbPath: () => '/tmp/db',
    createStreamAbortSignal: vi.fn(() => () => false),
    getVideoImagesGeneration: vi.fn(() => ({
      getVideoImagesGenerationStatus: vi.fn(),
      iterateVideoImagesGeneration: vi.fn(),
    })),
    getImageMedia: vi.fn(),
  } as never
}

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
  }

  return res as ApiResponse & {statusCode: number; body: unknown}
}

describe('TasksMaintenance.controller', () => {
  const controller = createTasksMaintenanceController(createShared())

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns content hash backfill status', async () => {
    getContentHashBackfillStatus.mockResolvedValue({pending: 3, total: 10})

    const req = {} as ApiRequest
    const res = createResponse()

    await controller.contentHashBackfillStatus(req, res)

    expect(res.statusCode).toBe(201)
    expect(res.body).toEqual({pending: 3, total: 10})
  })

  it('returns missing media status', async () => {
    getMissingMediaStatus.mockResolvedValue({missing: 2})

    const req = {} as ApiRequest
    const res = createResponse()

    await controller.missingMediaStatus(req, res)

    expect(res.statusCode).toBe(201)
    expect(res.body).toEqual({missing: 2})
  })

  it('relinks missing media paths and reports updated count', async () => {
    const req = {
      body: {
        matches: [
          {id: 1, newPath: '/media/a.mp4', oshash: 'abc'},
          {id: null, path: '/media/b.mp4'},
          {id: 2, path: '/media/c.mp4'},
        ],
      },
    } as ApiRequest
    const res = createResponse()

    await controller.relinkMissingMedia(req, res)

    expect(updateById).toHaveBeenCalledTimes(2)
    expect(updateById).toHaveBeenNthCalledWith(1, 1, {
      path: '/media/a.mp4',
      basename: 'a.mp4',
      name: 'a',
      ext: '.mp4',
      oshash: 'abc',
    }, {silent: true})
    expect(updateById).toHaveBeenNthCalledWith(2, 2, {
      path: '/media/c.mp4',
      basename: 'c.mp4',
      name: 'c',
      ext: '.mp4',
    }, {silent: true})
    expect(res.statusCode).toBe(201)
    expect(res.body).toEqual({updated: 2})
  })

  it('returns 500 when status lookup fails', async () => {
    getContentHashBackfillStatus.mockRejectedValue(new Error('db unavailable'))

    const req = {} as ApiRequest
    const res = createResponse()

    await controller.contentHashBackfillStatus(req, res)

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({message: 'db unavailable'})
  })
})
