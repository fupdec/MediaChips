import {describe, it, expect, vi, beforeEach} from 'vitest'
import type {ApiRequest, ApiResponse} from '../types/http'

const {
  create,
  findAll,
  findById,
  findLatest,
  updateById,
  deleteById,
  ensureArrayMetaResources,
  deleteMetaInMediaByMetaId,
  deletePinnedByMetaId,
  existsSync,
  mkdirSync,
  rmSync,
} = vi.hoisted(() => ({
  create: vi.fn(),
  findAll: vi.fn(),
  findById: vi.fn(),
  findLatest: vi.fn(),
  updateById: vi.fn(),
  deleteById: vi.fn(),
  ensureArrayMetaResources: vi.fn(),
  deleteMetaInMediaByMetaId: vi.fn(),
  deletePinnedByMetaId: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
}))

vi.mock('../db/repositories/meta', () => ({
  createMetaRepository: () => ({
    create,
    findAll,
    findById,
    findLatest,
    updateById,
    deleteById,
    ensureArrayMetaResources,
  }),
}))

vi.mock('../db/repositories/metaInMediaTypes', () => ({
  createMetaInMediaTypesRepository: () => ({
    deleteByMetaId: deleteMetaInMediaByMetaId,
  }),
}))

vi.mock('../db/repositories/pinnedMeta', () => ({
  createPinnedMetaRepository: () => ({
    deleteByMetaId: deletePinnedByMetaId,
  }),
}))

vi.mock('fs', () => ({
  default: {
    existsSync,
    mkdirSync,
    rmSync,
  },
}))

import createMetaController from './Meta.controller'

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

describe('Meta.controller', () => {
  const controller = createMetaController({
    drizzle: {},
    path: '/tmp/db',
  } as never)

  beforeEach(() => {
    vi.clearAllMocks()
    existsSync.mockReturnValue(false)
  })

  it('creates meta and prepares array resources', () => {
    create.mockReturnValue({id: 7, type: 'array', name: 'Tags'})

    const req = {body: {name: 'Tags', type: 'array'}} as ApiRequest
    const res = createResponse()

    controller.create(req, res)

    expect(create).toHaveBeenCalledWith({name: 'Tags', type: 'array'})
    expect(mkdirSync).toHaveBeenCalledWith('/tmp/db/meta/7')
    expect(ensureArrayMetaResources).toHaveBeenCalledWith(7)
    expect(res.statusCode).toBe(201)
    expect(res.body).toEqual({id: 7, type: 'array', name: 'Tags'})
  })

  it('returns all meta rows', () => {
    findAll.mockReturnValue([{id: 1}, {id: 2}])

    const req = {} as ApiRequest
    const res = createResponse()

    controller.findAll(req, res)

    expect(res.statusCode).toBe(201)
    expect(res.body).toEqual([{id: 1}, {id: 2}])
  })

  it('returns a single meta row by id', () => {
    findById.mockReturnValue({id: 3, name: 'Performers'})

    const req = {params: {id: '3'}} as unknown as ApiRequest
    const res = createResponse()

    controller.findOne(req, res)

    expect(findById).toHaveBeenCalledWith(3)
    expect(res.statusCode).toBe(201)
    expect(res.body).toEqual({id: 3, name: 'Performers'})
  })

  it('returns latest meta rows', () => {
    findLatest.mockReturnValue([{id: 9}])

    const req = {} as ApiRequest
    const res = createResponse()

    controller.findLatest(req, res)

    expect(findLatest).toHaveBeenCalledWith(1)
    expect(res.statusCode).toBe(201)
    expect(res.body).toEqual([{id: 9}])
  })

  it('updates meta by id', () => {
    const req = {
      params: {id: '4'},
      body: {name: 'Updated'},
    } as unknown as ApiRequest
    const res = createResponse()

    controller.update(req, res)

    expect(updateById).toHaveBeenCalledWith(4, {name: 'Updated'})
    expect(res.statusCode).toBe(201)
  })

  it('deletes meta and removes generated folder', () => {
    const req = {params: {id: '5'}} as unknown as ApiRequest
    const res = createResponse()

    controller.deleteOne(req, res)

    expect(deleteMetaInMediaByMetaId).toHaveBeenCalledWith(5)
    expect(deletePinnedByMetaId).toHaveBeenCalledWith(5)
    expect(deleteById).toHaveBeenCalledWith(5)
    expect(rmSync).toHaveBeenCalledWith('/tmp/db/meta/5', {
      recursive: true,
      force: true,
    })
    expect(res.statusCode).toBe(201)
  })

  it('returns 500 when create fails', () => {
    create.mockImplementation(() => {
      throw new Error('insert failed')
    })

    const req = {body: {name: 'Broken'}} as ApiRequest
    const res = createResponse()

    controller.create(req, res)

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({message: 'insert failed'})
  })
})
