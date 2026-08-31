import {describe, it, expect, vi, beforeEach} from 'vitest'
import type {ApiRequest, ApiResponse} from '../types/http'
import {HttpError} from '../types/errors'

const {
  createAssignment,
  findByMetaId,
  findById,
  updateById,
  assertMetaIsTagLeaf,
  transaction,
} = vi.hoisted(() => ({
  createAssignment: vi.fn(),
  findByMetaId: vi.fn(),
  findById: vi.fn(),
  updateById: vi.fn(),
  assertMetaIsTagLeaf: vi.fn(),
  transaction: vi.fn((fn: (tx: unknown) => unknown) => fn({})),
}))

vi.mock('../db/repositories/metaInMediaTypes', () => ({
  createMetaInMediaTypesRepository: () => ({
    create: createAssignment,
    findByMetaId,
  }),
}))

vi.mock('../db/repositories/meta', () => ({
  createMetaRepository: () => ({
    findById,
    updateById,
  }),
}))

vi.mock('../services/tagCategoryTree', () => ({
  assertMetaIsTagLeaf,
}))

import createMetaInMediaTypeController from './MetaInMediaType.controller'

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
  return res as unknown as ApiResponse & {statusCode: number; body: unknown}
}

function createRequest(body: Record<string, unknown>): ApiRequest {
  return {body} as ApiRequest
}

describe('MetaInMediaType.controller create', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findByMetaId.mockReturnValue([])
    createAssignment.mockImplementation((data: Record<string, unknown>) => ({
      ...data,
      show: true,
    }))
  })

  it('pins rating fields to media without leaf-category checks', () => {
    findById.mockReturnValue({id: 9, type: 'rating', name: 'Score', parser: false})
    const controller = createMetaInMediaTypeController({
      drizzle: {transaction},
    } as never)
    const res = createResponse()

    controller.create(createRequest({metaId: 9, mediaTypeId: 2, order: 0}), res)

    expect(res.statusCode).toBe(201)
    expect(createAssignment).toHaveBeenCalledWith({
      metaId: 9,
      mediaTypeId: 2,
      order: 0,
    })
    expect(assertMetaIsTagLeaf).not.toHaveBeenCalled()
    expect(updateById).not.toHaveBeenCalled()
  })

  it('pins number/string/boolean/date fields the same way', () => {
    for (const type of ['number', 'string', 'boolean', 'date'] as const) {
      vi.clearAllMocks()
      findByMetaId.mockReturnValue([])
      findById.mockReturnValue({id: 11, type, name: type, parser: false})
      createAssignment.mockImplementation((data: Record<string, unknown>) => data)

      const controller = createMetaInMediaTypeController({
        drizzle: {transaction},
      } as never)
      const res = createResponse()
      controller.create(createRequest({metaId: 11, mediaTypeId: 1, order: 3}), res)

      expect(res.statusCode).toBe(201)
      expect(assertMetaIsTagLeaf).not.toHaveBeenCalled()
      expect(createAssignment).toHaveBeenCalled()
    }
  })

  it('rejects parent/group tag categories when pinning to media', () => {
    findById.mockReturnValue({id: 3, type: 'array', name: 'People', parser: true})
    assertMetaIsTagLeaf.mockImplementation(() => {
      throw new HttpError(400, 'Parent tag categories cannot be assigned to media', {
        code: 'category_is_group',
      })
    })

    const controller = createMetaInMediaTypeController({
      drizzle: {transaction},
    } as never)
    const res = createResponse()

    controller.create(createRequest({metaId: 3, mediaTypeId: 2, order: 0}), res)

    expect(assertMetaIsTagLeaf).toHaveBeenCalled()
    expect(createAssignment).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
  })
})
