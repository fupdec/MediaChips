/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { resolveMediaIdFromGridRequest } from './videoGridRequest'

describe('resolveMediaIdFromGridRequest', () => {
  it('prefers numeric body.id', () => {
    expect(resolveMediaIdFromGridRequest({id: 12, output: '99.jpg'})).toBe(12)
  })

  it('falls back to output basename stem', () => {
    expect(resolveMediaIdFromGridRequest({output: '/grids/42.jpeg'})).toBe(42)
    expect(resolveMediaIdFromGridRequest({output: 'nope.txt'})).toBeNull()
    expect(resolveMediaIdFromGridRequest({})).toBeNull()
  })
})
