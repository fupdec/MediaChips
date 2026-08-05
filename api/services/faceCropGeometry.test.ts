import {describe, expect, it} from 'vitest'
import {computePaddedSquareCropRect} from './faceCropGeometry'

describe('computePaddedSquareCropRect', () => {
  it('expands a landscape box toward a square inside the frame', () => {
    const rect = computePaddedSquareCropRect(
      {x: 40, y: 40, width: 40, height: 20},
      200,
      200,
      0,
    )
    expect(rect.width).toBe(rect.height)
    expect(rect.left).toBeGreaterThanOrEqual(0)
    expect(rect.top).toBeGreaterThanOrEqual(0)
    expect(rect.left + rect.width).toBeLessThanOrEqual(200)
    expect(rect.top + rect.height).toBeLessThanOrEqual(200)
  })

  it('shifts inward near image edges', () => {
    const rect = computePaddedSquareCropRect(
      {x: 0, y: 0, width: 20, height: 20},
      100,
      100,
      0.2,
    )
    expect(rect.left).toBe(0)
    expect(rect.top).toBe(0)
    expect(rect.width).toBeGreaterThan(20)
    expect(rect.height).toBeGreaterThan(20)
  })

  it('never returns a zero-sized crop', () => {
    const rect = computePaddedSquareCropRect(
      {x: 99, y: 99, width: 1, height: 1},
      100,
      100,
      0,
    )
    expect(rect.width).toBeGreaterThanOrEqual(1)
    expect(rect.height).toBeGreaterThanOrEqual(1)
  })
})
