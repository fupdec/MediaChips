import {describe, expect, it} from 'vitest'
import {sourceFailure} from './sourceErrors'

describe('source error categories', () => {
  it.each([
    [{code: 'ENOTFOUND'}, 'network_error'], [{code: 'ETIMEDOUT'}, 'network_error'],
    [{code: 'ERR_NETWORK'}, 'network_error'], [{level: 'client-authentication'}, 'auth_required'],
    [{code: 530}, 'auth_required'], [{code: 3}, 'permission_denied'],
    [{response: {status: 403, data: {code: 'permission_denied'}}}, 'permission_denied'],
    [{response: {status: 409, data: {code: 'auth_required'}}}, 'auth_required'],
    [{response: {status: 401}}, 'auth_required'],
    [{response: {status: 400, data: {error: 'invalid_grant'}}}, 'auth_required'],
    [{response: {status: 403, data: {error: {errors: [{reason: 'rateLimitExceeded'}]}}}}, undefined],
    [{response: {status: 404}}, undefined], [{response: {status: 500}}, undefined],
    [{code: 550, message: 'File not found'}, undefined],
    [{code: 550, message: 'Permission denied'}, 'permission_denied'],
    [{response: {status: 403, data: {code: 'rate_limited'}}}, undefined],
    [{response: {status: 400, data: {error: null}}}, undefined],
    [null, undefined],
  ])('classifies %j as %s', (error, category) => expect(sourceFailure(error)).toBe(category))
})
