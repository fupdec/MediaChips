import { describe, expect, it, vi } from 'vitest'
import { asyncHandler } from './asyncHandler'
import { HttpError } from '../types/errors'

function createResponse() {
  const res = {
    statusCode: 200,
    headersSent: false,
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
  return res
}

describe('asyncHandler', () => {
  it('forwards successful handlers', async () => {
    const res = createResponse()
    const next = vi.fn()
    const handler = asyncHandler(async (_req, response) => {
      response.status(201).send({ok: true})
    })

    await handler({} as never, res as never, next)

    expect(res.statusCode).toBe(201)
    expect(res.body).toEqual({ok: true})
    expect(next).not.toHaveBeenCalled()
  })

  it('maps thrown HttpError to JSON response', async () => {
    const res = createResponse()
    const next = vi.fn()
    const handler = asyncHandler(async () => {
      throw new HttpError(409, 'conflict', {code: 'conflict'})
    })

    await handler({} as never, res as never, next)

    expect(res.statusCode).toBe(409)
    expect(res.body).toEqual({message: 'conflict', code: 'conflict'})
    expect(next).not.toHaveBeenCalled()
  })

  it('delegates to next when headers were already sent', async () => {
    const res = createResponse()
    res.headersSent = true
    const next = vi.fn()
    const err = new Error('late')
    const handler = asyncHandler(async () => {
      throw err
    })

    await handler({} as never, res as never, next)

    expect(next).toHaveBeenCalledWith(err)
  })
})
