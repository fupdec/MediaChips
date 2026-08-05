import {describe, expect, it} from 'vitest'
import {parseClampedLimit, parseOptionalInt} from './parseRequestNumber'

describe('parseRequestNumber', () => {
  it('parses optional ints', () => {
    expect(parseOptionalInt(undefined)).toBeUndefined()
    expect(parseOptionalInt('')).toBeUndefined()
    expect(parseOptionalInt('12')).toBe(12)
    expect(parseOptionalInt('x')).toBeUndefined()
  })

  it('clamps limits into range', () => {
    expect(parseClampedLimit(undefined, 12)).toBe(12)
    expect(parseClampedLimit(0, 12)).toBe(12)
    expect(parseClampedLimit(100, 12, 24)).toBe(24)
    expect(parseClampedLimit(8, 12, 24)).toBe(8)
  })
})
