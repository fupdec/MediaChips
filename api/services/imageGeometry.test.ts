import {describe, expect, it} from 'vitest'
import {getCenterCropRect, getDisplayDimensions} from './imageGeometry'

describe('getDisplayDimensions', () => {
  it('keeps dimensions for normal orientations', () => {
    expect(getDisplayDimensions(1920, 1080, 1)).toEqual({width: 1920, height: 1080})
    expect(getDisplayDimensions(1920, 1080, 3)).toEqual({width: 1920, height: 1080})
  })

  it('swaps width and height for 90°-family EXIF orientations', () => {
    for (const orientation of [5, 6, 7, 8]) {
      expect(getDisplayDimensions(1920, 1080, orientation)).toEqual({
        width: 1080,
        height: 1920,
      })
    }
  })
})

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
