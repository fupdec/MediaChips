import {describe, expect, it} from 'vitest'
import {
  decodeGenderagePrediction,
  sampleGenderBilinear,
  warpGenderAffineRgb,
} from './faceGenderWarp'
import {buildScaleTranslate} from './faceAlignMath'

describe('sampleGenderBilinear', () => {
  it('samples clamped RGBA pixels', () => {
    const data = new Uint8Array([
      10, 0, 0, 255, 20, 0, 0, 255,
      30, 0, 0, 255, 40, 0, 0, 255,
    ])
    const image = {width: 2, height: 2, bitmap: {data}}
    expect(sampleGenderBilinear(image, 0, 0)[0]).toBeCloseTo(10, 5)
    expect(sampleGenderBilinear(image, 1.5, 0.5)[0]).toBeGreaterThan(20)
  })
})

describe('warpGenderAffineRgb', () => {
  it('emits normalized NCHW planes', () => {
    const data = new Uint8Array(4 * 4 * 4)
    data.fill(127)
    const image = {width: 4, height: 4, bitmap: {data}}
    const M = buildScaleTranslate(2, 2, 1, 2)
    const out = warpGenderAffineRgb(image, M, 2, 2)
    expect(out).toHaveLength(2 * 2 * 3)
    expect(out[0]).toBeCloseTo((127 - 127.5) / 128, 5)
  })
})

describe('decodeGenderagePrediction', () => {
  it('decodes male/female logits and age', () => {
    const male = decodeGenderagePrediction([0, 5, 0.25])
    expect(male?.gender).toBe('male')
    expect(male?.age).toBe(25)
    expect(male?.confidence).toBeGreaterThan(0.5)

    const female = decodeGenderagePrediction([5, 0, 0.4])
    expect(female?.gender).toBe('female')
    expect(female?.age).toBe(40)

    expect(decodeGenderagePrediction([1, 2])).toBeNull()
    expect(decodeGenderagePrediction([NaN, 1, 0.2])).toBeNull()
  })
})
