import { describe, expect, it } from 'vitest'
import axios from 'axios'
import { getApiErrorMessage } from './vue'

describe('getApiErrorMessage', () => {
  it('returns server message from axios error response object', () => {
    const error = new axios.AxiosError(
      'Request failed with status code 400',
      'ERR_BAD_REQUEST',
      undefined,
      undefined,
      {
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        config: {} as never,
        data: { message: 'Invalid JSON in dbv.json' },
      },
    )

    expect(getApiErrorMessage(error)).toBe('Invalid JSON in dbv.json')
  })

  it('returns server message from plain string response body', () => {
    const error = new axios.AxiosError(
      'Request failed with status code 400',
      'ERR_BAD_REQUEST',
      undefined,
      undefined,
      {
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        config: {} as never,
        data: 'Backup file not found',
      },
    )

    expect(getApiErrorMessage(error)).toBe('Backup file not found')
  })

  it('falls back to Error message for non-axios errors', () => {
    expect(getApiErrorMessage(new Error('Something went wrong'))).toBe('Something went wrong')
  })

  it('uses fallback when no message is available', () => {
    expect(getApiErrorMessage({}, 'Fallback message')).toBe('Fallback message')
  })
})
