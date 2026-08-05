import {describe, expect, it} from 'vitest'
import {
  buildFaceDetectionStatusSnapshot,
  buildFaceMatchStatusSnapshot,
  resolveConfiguredOrScraperMetaId,
} from './faceStatusSnapshots'

describe('buildFaceDetectionStatusSnapshot', () => {
  it('computes pending from total and generated', () => {
    expect(buildFaceDetectionStatusSnapshot({
      total: 10,
      generated: 4,
      faces: 20,
    })).toEqual({
      total: 10,
      generated: 4,
      pending: 6,
      faces: 20,
    })
    expect(buildFaceDetectionStatusSnapshot({
      total: 2,
      generated: 5,
      faces: 0,
    }).pending).toBe(0)
  })
})

describe('buildFaceMatchStatusSnapshot', () => {
  it('passes through status fields', () => {
    const settings = {
      performerMetaId: 1,
      minConfidence: 0.55,
      candidateLimit: 5,
      mode: 'auto' as const,
      matchAfterDetect: true,
    }
    expect(buildFaceMatchStatusSnapshot({
      settings,
      embedModel: {status: 'loaded', model: 'm'},
      faces: 3,
      matchedFaces: 1,
      performerTags: 2,
      enrolledFaces: 4,
      enrolledTags: 2,
    })).toMatchObject({
      settings,
      faces: 3,
      enrolledFaces: 4,
    })
  })
})

describe('resolveConfiguredOrScraperMetaId', () => {
  it('prefers configured id, else scraper array meta', () => {
    expect(resolveConfiguredOrScraperMetaId(7, [])).toBe(7)
    expect(resolveConfiguredOrScraperMetaId(null, [
      {id: 1, scraper: null, type: 'array'},
      {id: 2, scraper: 'x', type: 'string'},
      {id: 3, scraper: 'y', type: 'array'},
    ])).toBe(3)
    expect(resolveConfiguredOrScraperMetaId(0, [])).toBeNull()
  })
})
