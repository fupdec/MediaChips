import { describe, expect, it } from 'vitest'
import { getCenterCropRect } from './imageMedia'

describe('getCenterCropRect', () => {
  it('crops tall images to a wider target aspect ratio', () => {
    const crop = getCenterCropRect(1000, 2500, 0.5)
    expect(crop).toEqual({x: 0, y: 250, w: 1000, h: 2000})
  })

  it('crops wide images to a taller target aspect ratio', () => {
    const crop = getCenterCropRect(2500, 1000, 2)
    expect(crop).toEqual({x: 250, y: 0, w: 2000, h: 1000})
  })

  it('never exceeds source image bounds', () => {
    const crop = getCenterCropRect(1000, 2500, 0.5)
    expect(crop.x).toBeGreaterThanOrEqual(0)
    expect(crop.y).toBeGreaterThanOrEqual(0)
    expect(crop.x + crop.w).toBeLessThanOrEqual(1000)
    expect(crop.y + crop.h).toBeLessThanOrEqual(2500)
  })
})
