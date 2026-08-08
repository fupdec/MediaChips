import {describe, it, expect, vi, beforeEach} from 'vitest'
import type {ApiRequest, ApiResponse} from '../../types/http'

const {
  getStatus,
  loadModel,
  getFaceDetectionStatus,
  getEmbedStatus,
  loadEmbedModel,
  getFaceMatchStatus,
  getFaceMatchSettings,
  listFacesForMedia,
  listFacesForTag,
  detectMedia,
  matchMediaFaces,
  assignFaceToPerformer,
  clearFaceMatch,
  enrollTagFaces,
  getEnrollmentQualityForTag,
  findById,
  resolveExistingPath,
} = vi.hoisted(() => ({
  getStatus: vi.fn(),
  loadModel: vi.fn(),
  getFaceDetectionStatus: vi.fn(),
  getEmbedStatus: vi.fn(),
  loadEmbedModel: vi.fn(),
  getFaceMatchStatus: vi.fn(),
  getFaceMatchSettings: vi.fn(),
  listFacesForMedia: vi.fn(),
  listFacesForTag: vi.fn(),
  detectMedia: vi.fn(),
  matchMediaFaces: vi.fn(),
  assignFaceToPerformer: vi.fn(),
  clearFaceMatch: vi.fn(),
  enrollTagFaces: vi.fn(),
  getEnrollmentQualityForTag: vi.fn(),
  findById: vi.fn(),
  resolveExistingPath: vi.fn(),
}))

vi.mock('../../services/faceDetector', () => ({
  getStatus,
  loadModel,
  getFaceDetectionStatus,
  detectMedia,
}))

vi.mock('../../services/faceDetectOrchestrate', () => ({
  iterateFaceDetection: vi.fn(),
}))

vi.mock('../../services/faceRecognition', () => ({
  getEmbedStatus,
  loadEmbedModel,
  getFaceMatchStatus,
  getFaceMatchSettings,
  listFacesForMedia,
  matchMediaFaces,
  assignFaceToPerformer,
  clearFaceMatch,
  enrollTagFaces,
  iterateEnrollFromPerformerImages: vi.fn(),
  iterateFaceMatching: vi.fn(),
}))

vi.mock('../../services/faceAppearances', () => ({
  listFacesForTag,
}))

vi.mock('../../services/enrollmentQuality', () => ({
  getEnrollmentQualityForTag,
  iterateEnrollmentQualityReport: vi.fn(),
}))

vi.mock('../../db/repositories/media', () => ({
  createMediaRepository: () => ({findById}),
}))

vi.mock('../../services/contentHash', () => ({
  resolveExistingPath,
}))

import createTasksFacesController from './TasksFaces.controller'

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
    sendStatus(code: number) {
      this.statusCode = code
      return this
    },
  }
  return res as ApiResponse & {statusCode: number; body: unknown}
}

describe('TasksFaces.controller', () => {
  const controller = createTasksFacesController({
    db: {drizzle: {}, path: '/tmp/db'} as never,
    createStreamAbortSignal: () => () => false,
  } as never)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns face model status', async () => {
    getStatus.mockReturnValue({downloaded: true})
    const res = createResponse()
    await controller.faceModelStatus({} as ApiRequest, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({downloaded: true})
  })

  it('rejects facesForMedia without mediaId', async () => {
    const res = createResponse()
    await controller.facesForMedia({query: {}, body: {}} as ApiRequest, res)
    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({message: 'mediaId is required'})
    expect(listFacesForMedia).not.toHaveBeenCalled()
  })

  it('lists faces for media', async () => {
    listFacesForMedia.mockResolvedValue([{id: 1}])
    const res = createResponse()
    await controller.facesForMedia({
      query: {mediaId: '12'},
      body: {},
    } as unknown as ApiRequest, res)
    expect(listFacesForMedia).toHaveBeenCalledWith(
      expect.anything(),
      12,
      {ensureCrops: true},
    )
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual([{id: 1}])
  })

  it('rejects facesForTag without tagId', async () => {
    const res = createResponse()
    await controller.facesForTag({query: {}, body: {}} as ApiRequest, res)
    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({message: 'tagId is required'})
    expect(listFacesForTag).not.toHaveBeenCalled()
  })

  it('lists faces for tag with pagination options', async () => {
    listFacesForTag.mockReturnValue({items: [{faceId: 1}], count: 1})
    const res = createResponse()
    await controller.facesForTag({
      query: {},
      body: {tagId: 10, sort: 'shuffle', limit: 5, offset: 2, countOnly: false},
    } as unknown as ApiRequest, res)
    expect(listFacesForTag).toHaveBeenCalledWith(
      expect.anything(),
      10,
      {countOnly: false, sort: 'shuffle', limit: 5, offset: 2},
    )
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({items: [{faceId: 1}], count: 1})
  })

  it('returns 404 when detecting faces for missing media', async () => {
    findById.mockReturnValue(undefined)
    const res = createResponse()
    await controller.detectFacesForMedia({
      body: {mediaId: 9},
    } as unknown as ApiRequest, res)
    expect(res.statusCode).toBe(404)
    expect(res.body).toEqual({message: 'Media not found'})
  })

  it('assigns a face performer', async () => {
    assignFaceToPerformer.mockResolvedValue({ok: true})
    const res = createResponse()
    await controller.assignFacePerformer({
      body: {faceId: 3, tagId: 8, enroll: true},
    } as unknown as ApiRequest, res)
    expect(assignFaceToPerformer).toHaveBeenCalledWith(
      expect.anything(),
      3,
      8,
      {enroll: true, applyTag: false, matchScore: undefined},
    )
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ok: true})
  })

  it('maps service failures through sendControllerError', async () => {
    getStatus.mockImplementation(() => {
      throw new Error('status failed')
    })
    const res = createResponse()
    await controller.faceModelStatus({} as ApiRequest, res)
    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({message: 'status failed'})
  })
})
