import {describe, expect, it} from 'vitest'
import {
  clampFaceCandidateLimit,
  clampFaceDetectFramesPerVideo,
  clampFaceDetectMinScore,
  clampFaceMatchConfidence,
  normalizeGenderFilter,
  parseFaceMatchAfterDetect,
  parseFaceMatchMode,
} from './faceSettings'

describe('shared/faceSettings', () => {
  it('clamps detect and match values', () => {
    expect(clampFaceDetectMinScore(0.2)).toBe(0.5)
    expect(clampFaceDetectMinScore(0.9)).toBe(0.75)
    expect(clampFaceDetectFramesPerVideo(200)).toBe(99)
    expect(clampFaceCandidateLimit(1)).toBe(3)
    expect(clampFaceCandidateLimit(50)).toBe(20)
    expect(clampFaceCandidateLimit(undefined)).toBe(10)
    expect(clampFaceMatchConfidence(0.1)).toBe(0.2)
    expect(clampFaceMatchConfidence(0.99)).toBe(0.95)
  })

  it('normalizes gender, mode, and matchAfterDetect', () => {
    expect(normalizeGenderFilter('Female')).toBe('female')
    expect(normalizeGenderFilter('x')).toBe('both')
    expect(parseFaceMatchMode('suggest')).toBe('suggest')
    expect(parseFaceMatchMode('nope')).toBe('auto')
    expect(parseFaceMatchAfterDetect('0')).toBe(false)
    expect(parseFaceMatchAfterDetect(undefined)).toBe(true)
    expect(parseFaceMatchAfterDetect(1)).toBe(true)
  })
})
