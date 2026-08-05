import {describe, expect, it} from 'vitest'
import {
  clampFaceDetectFramesPerVideoForm,
  clampFaceDetectMinScoreForm,
  clampFaceMatchCandidateLimitForm,
  clampFaceMatchConfidenceForm,
  normalizeFaceGenderFilterForm,
  parseFaceMatchModeForm,
  parseMatchAfterDetectForm,
} from './faceSettingsForm'

describe('faceSettingsForm', () => {
  it('clamps detect and match form values', () => {
    expect(clampFaceDetectMinScoreForm(0.2)).toBe(0.5)
    expect(clampFaceDetectMinScoreForm(0.9)).toBe(0.75)
    expect(clampFaceDetectFramesPerVideoForm(200)).toBe(99)
    expect(clampFaceMatchCandidateLimitForm(1)).toBe(3)
    expect(clampFaceMatchCandidateLimitForm(50)).toBe(20)
    expect(clampFaceMatchConfidenceForm(0.1)).toBe(0.2)
    expect(clampFaceMatchConfidenceForm(0.99)).toBe(0.95)
  })

  it('normalizes gender, mode, and matchAfterDetect', () => {
    expect(normalizeFaceGenderFilterForm('Female')).toBe('female')
    expect(normalizeFaceGenderFilterForm('x')).toBe('both')
    expect(parseFaceMatchModeForm('suggest')).toBe('suggest')
    expect(parseFaceMatchModeForm('nope')).toBe('auto')
    expect(parseMatchAfterDetectForm('0')).toBe(false)
    expect(parseMatchAfterDetectForm(undefined)).toBe(true)
  })
})
