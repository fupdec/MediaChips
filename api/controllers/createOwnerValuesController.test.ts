/**
 * @vitest-environment node
 */
import {describe, expect, it, vi} from 'vitest'
import {createOwnerValuesController} from './createOwnerValuesController'
import type {ApiDb} from '../types/db'
import type {ApiRequest, ApiResponse} from '../types/http'

function mockRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code
      return this
    },
    send(body: unknown) {
      this.body = body
      return this
    },
    sendStatus(code: number) {
      this.statusCode = code
      return this
    },
  }
  return res as unknown as ApiResponse & {statusCode: number; body: unknown}
}

describe('createOwnerValuesController', () => {
  it('wires owner query and delete-all method names', async () => {
    const repo = {
      bulkCreate: vi.fn(() => [{id: 1}]),
      findAllByOwner: vi.fn(() => [{id: 2}]),
      deleteOne: vi.fn(),
      deleteByOwner: vi.fn(),
    }
    const controller = createOwnerValuesController({
      ownerQueryKey: 'tagId',
      deleteAllMethodName: 'deleteAllValuesByTagId',
      createRepository: () => repo,
    })({} as ApiDb)

    const listRes = mockRes()
    await controller.findAll(
      {query: {tagId: '9'}} as unknown as ApiRequest,
      listRes,
    )
    expect(repo.findAllByOwner).toHaveBeenCalledWith(9)
    expect(listRes.statusCode).toBe(201)

    const deleteRes = mockRes()
    await controller.deleteAllValuesByTagId(
      {params: {id: '3'}} as unknown as ApiRequest,
      deleteRes,
    )
    expect(repo.deleteByOwner).toHaveBeenCalledWith(3)
    expect(deleteRes.statusCode).toBe(201)
  })
})
