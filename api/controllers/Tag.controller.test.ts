import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ApiRequest, ApiResponse } from '../types/http'

const {
  bulkCreate,
  findById,
  countAll,
  findAllRaw,
  updateById,
  deleteById,
  convertMetaMarksToBookmarksByTagId,
  loadTagItems,
  deleteTagGeneratedAssets,
  mapWithConcurrency,
  readImageAsDataUrl,
} = vi.hoisted(() => ({
  bulkCreate: vi.fn(),
  findById: vi.fn(),
  countAll: vi.fn(),
  findAllRaw: vi.fn(),
  updateById: vi.fn(),
  deleteById: vi.fn(),
  convertMetaMarksToBookmarksByTagId: vi.fn(),
  loadTagItems: vi.fn(),
  deleteTagGeneratedAssets: vi.fn(),
  mapWithConcurrency: vi.fn(),
  readImageAsDataUrl: vi.fn(),
}))

vi.mock('../db/repositories/tags', () => ({
  createTagsRepository: () => ({
    bulkCreate,
    findById,
    countAll,
    findAllRaw,
    updateById,
    deleteById,
  }),
}))

vi.mock('../db/repositories/marks', () => ({
  createMarksRepository: () => ({
    convertMetaMarksToBookmarksByTagId,
  }),
}))

vi.mock('../services/tagItemsLoader', () => ({
  loadTagItems,
}))

vi.mock('../services/localAssetCleanup', () => ({
  deleteTagGeneratedAssets,
}))

vi.mock('../services/thumbEncoding', () => ({
  mapWithConcurrency: (...args: unknown[]) => mapWithConcurrency(...args),
  readImageAsDataUrl,
}))

import createTagController from './Tag.controller'

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

describe('Tag.controller', () => {
  const controller = createTagController({
    drizzle: {},
    sqlite: {},
    path: '/tmp/db',
  } as never)

  beforeEach(() => {
    vi.clearAllMocks()
    deleteTagGeneratedAssets.mockResolvedValue(undefined)
  })

  it('requires metaId for tag item listings', async () => {
    const req = {body: {}} as ApiRequest
    const res = createResponse()

    await controller.getAllForItems(req, res)

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({message: 'metaId is required'})
    expect(loadTagItems).not.toHaveBeenCalled()
  })

  it('loads tag items with parsed ids and pagination', async () => {
    loadTagItems.mockResolvedValue({items: [{id: 1}], total: 1})

    const req = {
      body: {
        metaId: 3,
        ids: ['10', 11, 'bad'],
        page: 2,
        limit: 25,
        sortBy: 'name',
        direction: 'asc',
      },
    } as ApiRequest
    const res = createResponse()

    await controller.getAllForItems(req, res)

    expect(loadTagItems).toHaveBeenCalledWith(expect.anything(), {
      metaId: 3,
      ids: [10, 11],
      filters: [],
      sortBy: 'name',
      direction: 'asc',
      find_duplicates: false,
      page: 2,
      limit: 25,
      skipTotals: false,
      search: undefined,
    })
    expect(res.statusCode).toBe(201)
    expect(res.body).toEqual({items: [{id: 1}], total: 1})
  })

  it('returns tag count', async () => {
    countAll.mockReturnValue(42)

    const req = {} as ApiRequest
    const res = createResponse()

    await controller.getCount(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({count: 42})
  })

  it('returns 404 when deleting a missing tag', async () => {
    findById.mockReturnValue(null)

    const req = {body: {id: 99}} as ApiRequest
    const res = createResponse()

    await controller.deleteOne(req, res)

    expect(res.statusCode).toBe(404)
    expect(res.body).toEqual({message: 'Tag not found.'})
    expect(deleteById).not.toHaveBeenCalled()
  })

  it('requires metaId before deleting tag assets', async () => {
    findById.mockReturnValue({id: 5, metaId: null})

    const req = {body: {id: 5}} as ApiRequest
    const res = createResponse()

    await controller.deleteOne(req, res)

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({message: 'metaId is required to delete tag assets.'})
    expect(deleteById).not.toHaveBeenCalled()
  })

  it('converts tag marks to bookmarks and deletes the tag record', async () => {
    findById.mockReturnValue({id: 5, metaId: 2, name: 'Action'})

    const req = {body: {id: 5}} as ApiRequest
    const res = createResponse()

    await controller.deleteOne(req, res)

    expect(convertMetaMarksToBookmarksByTagId).toHaveBeenCalledWith(5, 'Action')
    expect(deleteTagGeneratedAssets).toHaveBeenCalledWith('/tmp/db', 2, 5)
    expect(deleteById).toHaveBeenCalledWith(5)
    expect(res.statusCode).toBe(201)
  })

  it('requires metaId for thumbnail requests', async () => {
    const req = {body: {ids: [1]}} as ApiRequest
    const res = createResponse()

    await controller.getThumbs(req, res)

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({message: 'metaId is required'})
    expect(mapWithConcurrency).not.toHaveBeenCalled()
  })

  it('updates a tag with optional silent flag', () => {
    const req = {
      params: {id: '7'},
      body: {name: 'Updated', silent: true},
    } as unknown as ApiRequest
    const res = createResponse()

    controller.update(req, res)

    expect(updateById).toHaveBeenCalledWith(7, {name: 'Updated'}, {silent: true})
    expect(res.statusCode).toBe(201)
    expect(res.body).toEqual([1])
  })
})
