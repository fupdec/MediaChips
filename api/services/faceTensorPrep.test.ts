import {describe, expect, it} from 'vitest'
import {
  packInterleavedRgbToNchw,
  packRgbaBitmapToNchw,
  rgbaBitmapToInterleavedRgb,
} from './faceTensorPrep'

describe('faceTensorPrep', () => {
  it('packs interleaved RGB into NCHW planes', () => {
    const rgb = new Uint8Array([
      127.5, 0, 255,
      0, 127.5, 0,
    ])
    const out = packInterleavedRgbToNchw(rgb, 2, 1, 127.5, 127.5)
    expect(out.length).toBe(6)
    expect(out[0]).toBeCloseTo(0)
    expect(out[2]).toBeCloseTo(-1) // g plane first pixel
    expect(out[4]).toBeCloseTo(1) // b plane first pixel
  })

  it('converts RGBA bitmap to interleaved RGB', () => {
    const rgba = new Uint8Array([10, 20, 30, 255, 40, 50, 60, 255])
    expect(Array.from(rgbaBitmapToInterleavedRgb(rgba, 2))).toEqual([
      10, 20, 30, 40, 50, 60,
    ])
  })

  it('packs RGBA bitmap into NCHW without an intermediate buffer', () => {
    const rgba = new Uint8Array([255, 127.5, 0, 255])
    const out = packRgbaBitmapToNchw(rgba, 1, 1, 127.5, 127.5)
    expect(out[0]).toBeCloseTo(1)
    expect(out[1]).toBeCloseTo(0)
    expect(out[2]).toBeCloseTo(-1)
  })
})
