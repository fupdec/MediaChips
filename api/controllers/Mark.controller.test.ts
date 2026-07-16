import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ApiRequest, ApiResponse } from '../types/http'

const {
  create,
  findAllForVideo,
  findAllWithRelations,
  findClipsByTagId,
  countClipsByTagId,
  deleteById,
  loadMarkItems,
  getMarkFilterMetas,
  deleteMarkGeneratedAsset,
} = vi.hoisted(() => ({
  create: vi.fn(),
  findAllForVideo: vi.fn(),
  findAllWithRelations: vi.fn(),
  findClipsByTagId: vi.fn(),
  countClipsByTagId: vi.fn(),
  deleteById: vi.fn(),
  loadMarkItems: vi.fn(),
  getMarkFilterMetas: vi.fn(),
  deleteMarkGeneratedAsset: vi.fn(),
}))

vi.mock('../db/repositories/marks', () => ({
  createMarksRepository: () => ({
    create,
    findAllForVideo,
    findAllWithRelations,
    findClipsByTagId,
    countClipsByTagId,
    deleteById,
  }),
}))

vi.mock('../services/markItemsLoader', () => ({
  loadMarkItems,
  getMarkFilterMetas,
}))

vi.mock('../services/localAssetCleanup', () => ({
  deleteMarkGeneratedAsset,
}))

import createMarkController from './Mark.controller'

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

describe('Mark.controller', () => {
  const controller = createMarkController({
    drizzle: {},
    path: '/tmp/db',
  } as never)

  beforeEach(() => {
    vi.clearAllMocks()
    deleteMarkGeneratedAsset.mockReturnValue(undefined)
  })

  it('creates a mark', () => {
    create.mockReturnValue({id: 5, time: 12.5})

    const req = {body: {time: 12.5, mediaId: 1}} as ApiRequest
    const res = createResponse()

    controller.create(req, res)

    expect(create).toHaveBeenCalledWith({time: 12.5, mediaId: 1})
    expect(res.statusCode).toBe(201)
    expect(res.body).toEqual({id: 5, time: 12.5})
  })

  it('returns marks for a video', () => {
    findAllForVideo.mockReturnValue([{id: 1, time: 3}])

    const req = {params: {id: '42'}} as unknown as ApiRequest
    const res = createResponse()

    controller.findAllForVideo(req, res)

    expect(findAllForVideo).toHaveBeenCalledWith(42)
    expect(res.statusCode).toBe(201)
    expect(res.body).toEqual([{id: 1, time: 3}])
  })

  it('returns all marks with relations', () => {
    findAllWithRelations.mockReturnValue([{id: 2, tagId: 7}])

    const req = {} as ApiRequest
    const res = createResponse()

    controller.findAll(req, res)

    expect(res.statusCode).toBe(201)
    expect(res.body).toEqual([{id: 2, tagId: 7}])
  })

  it('loads mark items from request body', async () => {
    loadMarkItems.mockResolvedValue({items: [{id: 1}], total: 1})

    const req = {body: {page: 1, limit: 20}} as ApiRequest
    const res = createResponse()

    controller.getItems(req, res)
    await vi.waitFor(() => {
      expect(res.statusCode).toBe(201)
    })

    expect(loadMarkItems).toHaveBeenCalledWith(
      expect.objectContaining({path: '/tmp/db'}),
      {page: 1, limit: 20},
    )
    expect(res.body).toEqual({items: [{id: 1}], total: 1})
  })

  it('returns mark filter metas', async () => {
    getMarkFilterMetas.mockResolvedValue([{id: 3, name: 'Performers'}])

    const req = {} as ApiRequest
    const res = createResponse()

    controller.getFilterMetas(req, res)
    await vi.waitFor(() => {
      expect(res.statusCode).toBe(201)
    })

    expect(getMarkFilterMetas).toHaveBeenCalled()
    expect(res.body).toEqual([{id: 3, name: 'Performers'}])
  })

  it('returns ranged clips for a tag', () => {
    findClipsByTagId.mockReturnValue([
      {id: 10, markId: 1, path: '/a.mp4', segmentStart: 5, segmentEnd: 12},
    ])

    const req = {body: {tagId: 7}} as ApiRequest
    const res = createResponse()

    controller.getClips(req, res)

    expect(findClipsByTagId).toHaveBeenCalledWith(7)
    expect(res.statusCode).toBe(201)
    expect(res.body).toEqual({
      items: [{id: 10, markId: 1, path: '/a.mp4', segmentStart: 5, segmentEnd: 12}],
      count: 1,
    })
  })

  it('returns clip count only when requested', () => {
    countClipsByTagId.mockReturnValue(4)

    const req = {body: {tagId: 7, countOnly: true}} as ApiRequest
    const res = createResponse()

    controller.getClips(req, res)

    expect(countClipsByTagId).toHaveBeenCalledWith(7)
    expect(res.statusCode).toBe(201)
    expect(res.body).toEqual({items: [], count: 4})
  })

  it('deletes generated assets and mark row', () => {
    const req = {params: {id: '8'}} as unknown as ApiRequest
    const res = createResponse()

    controller.deleteOne(req, res)

    expect(deleteMarkGeneratedAsset).toHaveBeenCalledWith('/tmp/db', '8')
    expect(deleteById).toHaveBeenCalledWith(8)
    expect(res.statusCode).toBe(201)
  })

  it('returns 500 when mark items loading fails', async () => {
    loadMarkItems.mockRejectedValue(new Error('load failed'))

    const req = {body: {}} as ApiRequest
    const res = createResponse()

    controller.getItems(req, res)
    await vi.waitFor(() => {
      expect(res.statusCode).toBe(500)
    })

    expect(res.body).toEqual({message: 'load failed'})
  })
})
