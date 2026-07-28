import {describe, expect, it} from 'vitest'
import {
  MAX_ENROLLMENTS_PER_TAG,
  assessEnrollmentDetections,
  isNearDuplicateEmbedding,
} from './enrollmentGates'

function box(x: number, y: number, w: number, h: number) {
  return {x, y, width: w, height: h}
}

describe('enrollmentGates', () => {
  it('caps prototypes per tag', () => {
    expect(MAX_ENROLLMENTS_PER_TAG).toBe(5)
  })

  it('rejects empty / tiny / low-score / group shots', () => {
    expect(assessEnrollmentDetections([], 1000, 1000)).toMatchObject({ok: false, reason: 'no_face'})
    expect(assessEnrollmentDetections([
      {score: 0.9, box: box(100, 100, 40, 40)},
    ], 1000, 1000)).toMatchObject({ok: false, reason: 'face_too_small'})
    expect(assessEnrollmentDetections([
      {score: 0.4, box: box(100, 100, 300, 300)},
    ], 1000, 1000)).toMatchObject({ok: false, reason: 'low_score'})
    expect(assessEnrollmentDetections([
      {score: 0.9, box: box(100, 100, 300, 300)},
      {score: 0.8, box: box(500, 100, 280, 280)},
    ], 1000, 1000)).toMatchObject({ok: false, reason: 'multi_face'})
  })

  it('accepts a dominant primary face', () => {
    const result = assessEnrollmentDetections([
      {score: 0.9, box: box(100, 100, 300, 300)},
      {score: 0.7, box: box(800, 100, 60, 60)},
    ], 1000, 1000)
    expect(result.ok).toBe(true)
  })

  it('detects near-duplicate embeddings', () => {
    const a = Float32Array.from([1, 0, 0])
    expect(isNearDuplicateEmbedding(a, [a])).toBe(true)
    expect(isNearDuplicateEmbedding(Float32Array.from([0, 1, 0]), [a], 0.92)).toBe(false)
  })
})
