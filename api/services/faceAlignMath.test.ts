import {describe, expect, it} from 'vitest'
import {
  applyAffine,
  buildScaleTranslate,
  estimateSimilarity,
  estimateSimilarityFromEyes,
  invertAffine,
  landmarks106To5,
  solveLinear4,
  warpAffineRgb,
  type Point2,
} from './faceAlignMath'

describe('affine helpers', () => {
  it('buildScaleTranslate maps center to output midpoint', () => {
    const M = buildScaleTranslate(100, 50, 2, 112)
    expect(applyAffine(M, 100, 50)).toEqual({x: 56, y: 56})
  })

  it('invertAffine round-trips points', () => {
    const M = buildScaleTranslate(40, 30, 1.5, 64)
    const inv = invertAffine(M)
    const p = applyAffine(M, 10, 20)
    const back = applyAffine(inv, p.x, p.y)
    expect(back.x).toBeCloseTo(10, 5)
    expect(back.y).toBeCloseTo(20, 5)
  })

  it('invertAffine returns identity for singular matrices', () => {
    expect(invertAffine([[0, 0, 1], [0, 0, 2]])).toEqual([
      [1, 0, 0],
      [0, 1, 0],
    ])
  })
})

describe('estimateSimilarity', () => {
  it('recovers identity', () => {
    const pts = [{x: 0, y: 0}, {x: 10, y: 0}, {x: 0, y: 10}, {x: 5, y: 5}, {x: 8, y: 2}]
    const M = estimateSimilarity(pts, pts)
    expect(M).toBeTruthy()
    const p = applyAffine(M!, 3, 4)
    expect(p.x).toBeCloseTo(3, 4)
    expect(p.y).toBeCloseTo(4, 4)
  })

  it('recovers pure translation', () => {
    const src = [{x: 0, y: 0}, {x: 10, y: 0}, {x: 0, y: 10}, {x: 5, y: 5}, {x: 8, y: 2}]
    const dst = src.map((p) => ({x: p.x + 7, y: p.y - 3}))
    const M = estimateSimilarity(src, dst)!
    const p = applyAffine(M, 1, 2)
    expect(p.x).toBeCloseTo(8, 4)
    expect(p.y).toBeCloseTo(-1, 4)
  })

  it('returns null with fewer than 2 points', () => {
    expect(estimateSimilarity([{x: 1, y: 1}], [{x: 2, y: 2}])).toBeNull()
  })
})

describe('estimateSimilarityFromEyes', () => {
  it('maps eye pair with scale and rotation', () => {
    const src = [{x: 0, y: 0}, {x: 10, y: 0}]
    const dst = [{x: 0, y: 0}, {x: 0, y: 20}]
    const M = estimateSimilarityFromEyes(src, dst)!
    const eye1 = applyAffine(M, 10, 0)
    expect(eye1.x).toBeCloseTo(0, 4)
    expect(eye1.y).toBeCloseTo(20, 4)
  })

  it('returns null for degenerate eye distance', () => {
    expect(estimateSimilarityFromEyes(
      [{x: 1, y: 1}, {x: 1, y: 1}],
      [{x: 0, y: 0}, {x: 1, y: 0}],
    )).toBeNull()
  })
})

describe('solveLinear4', () => {
  it('solves identity system', () => {
    const A = new Float64Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ])
    const b = new Float64Array([2, 3, 4, 5])
    expect([...solveLinear4(A, b)!]).toEqual([2, 3, 4, 5])
  })

  it('returns null for singular matrix', () => {
    const A = new Float64Array(16)
    const b = new Float64Array([1, 2, 3, 4])
    expect(solveLinear4(A, b)).toBeNull()
  })
})

describe('landmarks106To5', () => {
  it('averages eye indexes and keeps nose/mouth points', () => {
    const points: Point2[] = Array.from({length: 106}, (_, i) => ({x: i, y: i * 2}))
    const five = landmarks106To5(points)
    expect(five).toHaveLength(5)
    expect(five[0]).toEqual({
      x: (33 + 35 + 40 + 39) / 4,
      y: (33 + 35 + 40 + 39) * 2 / 4,
    })
    expect(five[2]).toEqual(points[86])
    expect(five[3]).toEqual(points[52])
    expect(five[4]).toEqual(points[61])
  })
})

describe('warpAffineRgb', () => {
  it('warps a solid 2x2 RGBA image with identity scale', () => {
    const data = new Uint8Array([
      255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 255, 255, 0, 255,
    ])
    const image = {width: 2, height: 2, bitmap: {data}}
    const M = buildScaleTranslate(1, 1, 1, 2)
    const out = warpAffineRgb(image, M, 2, 2)
    expect(out).toHaveLength(2 * 2 * 3)
    // Centered sample should stay in-gamut RGB bytes.
    expect(out[0]).toBeGreaterThanOrEqual(0)
    expect(out[0]).toBeLessThanOrEqual(255)
  })
})
