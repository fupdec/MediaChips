import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ApiRequest, ApiResponse } from '../types/http'

const {
  findByMediaId,
  updateByMediaId,
} = vi.hoisted(() => ({
  findByMediaId: vi.fn(),
  updateByMediaId: vi.fn(),
}))

vi.mock('../db/repositories/videoMetadata', () => ({
  createVideoMetadataRepository: () => ({
    findByMediaId,
    updateByMediaId,
  }),
}))

import createVideoMetadataController from './VideoMetadata.controller'

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

describe('VideoMetadata.controller', () => {
  const controller = createVideoMetadataController({drizzle: {}} as never)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns metadata for a media id', () => {
    findByMediaId.mockReturnValue({mediaId: 12, duration: 120})

    const req = {params: {id: '12'}} as unknown as ApiRequest
    const res = createResponse()

    controller.findOne(req, res)

    expect(findByMediaId).toHaveBeenCalledWith(12)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({mediaId: 12, duration: 120})
  })

  it('returns null when metadata is missing', () => {
    findByMediaId.mockReturnValue(undefined)

    const req = {params: {id: '99'}} as unknown as ApiRequest
    const res = createResponse()

    controller.findOne(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toBeNull()
  })

  it('updates metadata by media id', () => {
    const req = {
      params: {id: '15'},
      body: {duration: 90, width: 1920, height: 1080},
    } as unknown as ApiRequest
    const res = createResponse()

    controller.update(req, res)

    expect(updateByMediaId).toHaveBeenCalledWith(15, {
      duration: 90,
      width: 1920,
      height: 1080,
    })
    expect(res.statusCode).toBe(200)
  })

  it('returns 500 when lookup fails', () => {
    findByMediaId.mockImplementation(() => {
      throw new Error('db unavailable')
    })

    const req = {params: {id: '1'}} as unknown as ApiRequest
    const res = createResponse()

    controller.findOne(req, res)

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({message: 'db unavailable'})
  })
})
