import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ApiRequest, ApiResponse } from '../types/http'

const {resolveExistingPath, getContentHashBackfillStatus} = vi.hoisted(() => ({
  resolveExistingPath: vi.fn(),
  getContentHashBackfillStatus: vi.fn(),
}))

vi.mock('../services/contentHash', () => ({
  resolveExistingPath,
}))

vi.mock('../services/mediaFingerprintBackfill', () => ({
  getContentHashBackfillStatus,
  getOshashBackfillStatus: vi.fn(),
  getFingerprintBackfillStatus: vi.fn(),
  iterateContentHashBackfill: vi.fn(),
  iterateOshashBackfill: vi.fn(),
  iterateFingerprintBackfill: vi.fn(),
}))

vi.mock('../services/missingMediaFinder', () => ({
  getMissingMediaStatus: vi.fn(),
  iterateMissingMediaSearch: vi.fn(),
}))

vi.mock('../services/imageThumbsGeneration', () => ({
  getImageThumbsGenerationStatus: vi.fn(),
  iterateImageThumbsGeneration: vi.fn(),
}))

vi.mock('../db/repositories/media', () => ({
  createMediaRepository: () => ({
    updateById: vi.fn(),
  }),
}))

import createTaskController from './Task.controller'

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
    json(payload: unknown) {
      res.body = payload
      return res
    },
  }

  return res as ApiResponse & {statusCode: number; body: unknown}
}

describe('Task.controller', () => {
  const controller = createTaskController({
    drizzle: {},
    sqlite: {},
    path: '/tmp/db',
  } as never)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exposes handlers from task sub-controllers', () => {
    expect(typeof controller.checkFileExists).toBe('function')
    expect(typeof controller.addMedia).toBe('function')
    expect(typeof controller.createTimeline).toBe('function')
    expect(typeof controller.contentHashBackfillStatus).toBe('function')
    expect(typeof controller.suggestTagsFromPaths).toBe('function')
    expect(typeof controller.importSavedFilters).toBe('function')
  })

  it('delegates checkFileExists to the file task handler', async () => {
    resolveExistingPath.mockResolvedValue('/resolved/video.mp4')

    const req = {body: {path: '/media/video.mp4'}} as ApiRequest
    const res = createResponse()

    await controller.checkFileExists(req, res)

    expect(resolveExistingPath).toHaveBeenCalled()
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({exists: true})
  })

  it('reports missing files from checkFileExists', async () => {
    resolveExistingPath.mockResolvedValue(null)

    const req = {body: {path: '/media/missing.mp4'}} as ApiRequest
    const res = createResponse()

    await controller.checkFileExists(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({exists: false})
  })

  it('delegates maintenance status handlers', async () => {
    getContentHashBackfillStatus.mockResolvedValue({pending: 2, total: 5})

    const req = {} as ApiRequest
    const res = createResponse()

    await controller.contentHashBackfillStatus(req, res)

    expect(res.statusCode).toBe(201)
    expect(res.body).toEqual({pending: 2, total: 5})
  })
})
