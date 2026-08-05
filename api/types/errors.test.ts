import { describe, expect, it } from 'vitest'
import {
  HttpError,
  httpStatusFromError,
  sendControllerError,
} from './errors'

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
  }
  return res
}

describe('HttpError / sendControllerError', () => {
  it('reads status from HttpError and merges body fields', () => {
    const res = createResponse()
    sendControllerError(
      res as never,
      new HttpError(409, 'LAN locked', {code: 'lan_locked'}),
      'fallback',
    )

    expect(res.statusCode).toBe(409)
    expect(res.body).toEqual({
      message: 'LAN locked',
      code: 'lan_locked',
    })
  })

  it('supports duck-typed domain errors with .status', () => {
    const res = createResponse()
    const err = Object.assign(new Error('name taken'), {
      status: 409,
      code: 'name_conflict',
      conflictingTagId: 42,
    })

    sendControllerError(res as never, err, 'fallback')

    expect(res.statusCode).toBe(409)
    expect(res.body).toEqual({
      message: 'name taken',
      code: 'name_conflict',
      conflictingTagId: 42,
    })
  })

  it('falls back to 500 for plain errors', () => {
    const res = createResponse()
    sendControllerError(res as never, new Error('boom'), 'fallback')

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({message: 'boom'})
  })

  it('httpStatusFromError ignores non-HTTP status values', () => {
    expect(httpStatusFromError({status: 200})).toBe(500)
    expect(httpStatusFromError({status: 404})).toBe(404)
    expect(httpStatusFromError(new Error('x'))).toBe(500)
  })
})
