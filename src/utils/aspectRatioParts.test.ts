import {describe, expect, it} from 'vitest'
import {approxAspectRatioParts} from './aspectRatioParts'

describe('approxAspectRatioParts', () => {
  it('returns 1:1 for invalid ratios', () => {
    expect(approxAspectRatioParts(0)).toEqual({width: 1, height: 1})
    expect(approxAspectRatioParts(-2)).toEqual({width: 1, height: 1})
    expect(approxAspectRatioParts(NaN)).toEqual({width: 1, height: 1})
  })

  it('keeps common presets exact', () => {
    expect(approxAspectRatioParts(1)).toEqual({width: 1, height: 1})
    expect(approxAspectRatioParts(16 / 9)).toEqual({width: 16, height: 9})
    expect(approxAspectRatioParts(5 / 8)).toEqual({width: 5, height: 8})
    expect(approxAspectRatioParts(4 / 5)).toEqual({width: 4, height: 5})
    expect(approxAspectRatioParts(21 / 9)).toEqual({width: 7, height: 3})
  })

  it('approximates arbitrary floats', () => {
    const parts = approxAspectRatioParts(1.777777)
    expect(parts.width / parts.height).toBeCloseTo(16 / 9, 2)
  })
})
