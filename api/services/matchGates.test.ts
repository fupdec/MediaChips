import {describe, expect, it} from 'vitest'
import {
  MATCH_MIN_DETECT_SCORE,
  assessMatchability,
  isMatchableStoredFace,
} from './matchGates'

describe('matchGates', () => {
  it('rejects low score / tiny / blurry detections', () => {
    expect(assessMatchability({
      score: 0.4,
      box: {x: 0, y: 0, width: 120, height: 120},
      frameWidth: 1280,
      frameHeight: 720,
    })).toMatchObject({ok: false, reason: 'low_score'})

    expect(assessMatchability({
      score: 0.9,
      box: {x: 0, y: 0, width: 30, height: 30},
      frameWidth: 1280,
      frameHeight: 720,
    })).toMatchObject({ok: false, reason: 'face_too_small'})

    expect(assessMatchability({
      score: 0.9,
      box: {x: 0, y: 0, width: 120, height: 120},
      frameWidth: 1280,
      frameHeight: 720,
      blurVariance: 5,
    })).toMatchObject({ok: false, reason: 'blurry'})
  })

  it('accepts strong faces', () => {
    expect(assessMatchability({
      score: MATCH_MIN_DETECT_SCORE,
      box: {x: 10, y: 10, width: 120, height: 140},
      frameWidth: 1280,
      frameHeight: 720,
      blurVariance: 40,
    }).ok).toBe(true)
  })

  it('gates stored faces by score and box size', () => {
    expect(isMatchableStoredFace({score: 0.9, width: 120, height: 120})).toBe(true)
    expect(isMatchableStoredFace({score: 0.4, width: 120, height: 120})).toBe(false)
    expect(isMatchableStoredFace({score: 0.9, width: 40, height: 40})).toBe(false)
  })
})
