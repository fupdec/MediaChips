import {describe, expect, it} from 'vitest'
import {
  clampFaceDetectFramesPerVideo,
  clampFaceDetectMinScore,
  clampFaceMatchConfidence,
  parseFaceDetectSettingsFromMap,
  parseFaceMatchMode,
  parseFaceMatchSettingsFromMap,
  resolveFaceDetectRuntimeOptions,
} from './faceSettingsParse'

describe('faceSettingsParse', () => {
  it('parses match mode', () => {
    expect(parseFaceMatchMode('suggest')).toBe('suggest')
    expect(parseFaceMatchMode('auto')).toBe('auto')
    expect(parseFaceMatchMode('nope')).toBe('suggest')
  })

  it('clamps confidence and detect gates', () => {
    expect(clampFaceMatchConfidence(0.1)).toBe(0.2)
    expect(clampFaceMatchConfidence(0.99)).toBe(0.95)
    expect(clampFaceDetectMinScore(0.2)).toBe(0.5)
    expect(clampFaceDetectFramesPerVideo(200)).toBe(99)
  })

  it('builds match settings from a settings map', () => {
    const map = new Map<string, unknown>([
      ['faceMatch.performerMetaId', '12'],
      ['faceMatch.minConfidence', '0.7'],
      ['faceMatch.candidateLimit', '5'],
      ['faceMatch.mode', 'suggest'],
      ['faceMatch.matchAfterDetect', '0'],
      ['faceMatch.autoBlindTags', '1'],
    ])
    expect(parseFaceMatchSettingsFromMap(map, (id) => id)).toEqual({
      performerMetaId: 12,
      minConfidence: 0.7,
      candidateLimit: 5,
      mode: 'suggest',
      matchAfterDetect: false,
      autoBlindTags: true,
    })
  })

  it('builds detect settings from a settings map', () => {
    expect(parseFaceDetectSettingsFromMap(new Map([
      ['faceDetect.minScore', '0.6'],
      ['faceDetect.framesPerVideo', '12'],
      ['faceDetect.genderFilter', 'female'],
    ]))).toEqual({
      minScore: 0.6,
      framesPerVideo: 12,
      genderFilter: 'female',
    })
  })

  it('resolves detect runtime options from overrides and settings', () => {
    expect(resolveFaceDetectRuntimeOptions(
      {framesPerVideo: 12, minScore: 0.6, persistCrops: true},
      {framesPerVideo: 6, minScore: 0.5},
    )).toMatchObject({
      framesPerVideo: 12,
      minScore: 0.6,
      persistCrops: true,
    })

    expect(resolveFaceDetectRuntimeOptions(
      {},
      {framesPerVideo: 6, minScore: 0.5},
    )).toMatchObject({
      framesPerVideo: 6,
      minScore: 0.5,
      persistCrops: false,
    })
  })
})
