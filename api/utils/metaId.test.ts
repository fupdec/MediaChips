/**
 * @vitest-environment node
 */
import {describe, expect, it} from 'vitest'
import {normalizeMetaIdParam, resolveMetaId} from './metaId'

describe('resolveMetaId', () => {
  it.each([
    [7, 7],
    [0, 0],
    [12.5, 12.5],
    ['42', 42],
    ['  9  ', 9],
    ['42.0', 42],
  ])('resolves %j to %j', (input, expected) => {
    expect(resolveMetaId(input)).toBe(expected)
  })

  it.each([
    [null],
    [undefined],
    [''],
    ['   '],
    ['meta'],
    ['12.5'],
    [Number.NaN],
    [Number.POSITIVE_INFINITY],
    [{}],
    [[]],
  ])('rejects %j', (input) => {
    expect(resolveMetaId(input)).toBeNull()
  })
})

describe('normalizeMetaIdParam', () => {
  it('returns a number when resolvable', () => {
    expect(normalizeMetaIdParam('15')).toBe(15)
    expect(normalizeMetaIdParam(3)).toBe(3)
    expect(normalizeMetaIdParam(12.5)).toBe(12.5)
  })

  it('passthroughs unresolved values', () => {
    expect(normalizeMetaIdParam('rating')).toBe('rating')
    expect(normalizeMetaIdParam(null)).toBeNull()
    expect(normalizeMetaIdParam('12.5')).toBe('12.5')
  })
})
