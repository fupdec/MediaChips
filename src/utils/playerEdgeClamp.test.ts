import {describe, expect, it} from 'vitest'
import {computeEdgeShift} from './playerEdgeClamp'

describe('computeEdgeShift', () => {
  it('returns 0 when the popover fits', () => {
    expect(computeEdgeShift(500, 200, 0, 1000)).toBe(0)
  })
  it('shifts right near the left edge', () => {
    expect(computeEdgeShift(50, 200, 0, 1000)).toBe(58)
  })
  it('shifts left near the right edge', () => {
    expect(computeEdgeShift(980, 200, 0, 1000)).toBe(-88)
  })
  it('aligns to the left edge when wider than the bounds', () => {
    expect(computeEdgeShift(100, 500, 0, 300)).toBe(158)
  })
})
