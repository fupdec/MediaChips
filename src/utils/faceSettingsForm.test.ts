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
  it('re-exports shared clamps for the settings UI', () => {
    expect(clampFaceDetectMinScoreForm(0.2)).toBe(0.5)
    expect(clampFaceDetectMinScoreForm(0.9)).toBe(0.75)
    expect(clampFaceDetectFramesPerVideoForm(200)).toBe(99)
    expect(clampFaceMatchCandidateLimitForm(1)).toBe(3)
    expect(clampFaceMatchCandidateLimitForm(50)).toBe(20)
    expect(clampFaceMatchConfidenceForm(0.1)).toBe(0.2)
    expect(clampFaceMatchConfidenceForm(0.99)).toBe(0.95)
    expect(normalizeFaceGenderFilterForm('Female')).toBe('female')
    expect(parseFaceMatchModeForm('suggest')).toBe('suggest')
    expect(parseMatchAfterDetectForm('0')).toBe(false)
  })
})
