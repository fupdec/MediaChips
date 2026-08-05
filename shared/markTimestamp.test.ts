import {describe, expect, it} from 'vitest'
import {formatMarkTimestamp} from './markTimestamp'

describe('formatMarkTimestamp', () => {
  it('formats seconds as HH:MM:SS.mmm', () => {
    expect(formatMarkTimestamp(0)).toBe('00:00:00.000')
    expect(formatMarkTimestamp(65.5)).toBe('00:01:05.500')
  })
})
