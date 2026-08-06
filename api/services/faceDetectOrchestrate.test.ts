import {describe, expect, it, vi, beforeEach} from 'vitest'

const {
  detectMedia,
  prepareDetectModel,
  getFaceDetectSettings,
  purgeAllFaceCrops,
  prepareEmbedModel,
  getFaceMatchSettings,
  matchMediaFaces,
  prepareGenderModel,
  resolveExistingPath,
  findByType,
} = vi.hoisted(() => ({
  detectMedia: vi.fn(),
  prepareDetectModel: vi.fn(async function* () {}),
  getFaceDetectSettings: vi.fn(() => ({
    framesPerVideo: 6,
    minScore: 0.5,
    genderFilter: 'both',
  })),
  purgeAllFaceCrops: vi.fn(),
  prepareEmbedModel: vi.fn(async function* () {}),
  getFaceMatchSettings: vi.fn(() => ({
    performerMetaId: 1,
    minConfidence: 0.5,
    candidateLimit: 5,
    mode: 'suggest',
    matchAfterDetect: true,
  })),
  matchMediaFaces: vi.fn(async () => ({matched: 1})),
  prepareGenderModel: vi.fn(async function* () {}),
  resolveExistingPath: vi.fn(async (path: string) => path),
  findByType: vi.fn(() => ({id: 2})),
}))

vi.mock('./faceDetector', () => ({
  detectMedia,
  prepareDetectModel,
  getFaceDetectSettings,
  purgeAllFaceCrops,
}))

vi.mock('./faceEmbedRuntime', () => ({
  prepareEmbedModel,
}))

vi.mock('./faceRecognition', () => ({
  getFaceMatchSettings,
  matchMediaFaces,
}))

vi.mock('./faceGender', () => ({
  prepareGenderModel,
}))

vi.mock('./contentHash', () => ({
  resolveExistingPath,
}))

vi.mock('../db/repositories/mediaTypes', () => ({
  createMediaTypesRepository: () => ({findByType}),
}))

vi.mock('../db/repositories/media', () => ({
  createMediaRepository: () => ({
    findById: vi.fn(),
    findByPaths: vi.fn(),
    findByMediaType: vi.fn(() => [{id: 10, path: '/a.mp4'}]),
  }),
}))

import {iterateFaceDetection} from './faceDetectOrchestrate'

describe('iterateFaceDetection match-after-detect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    detectMedia.mockResolvedValue({
      mediaId: 10,
      mediaPath: '/a.mp4',
      failed: false,
      missing: false,
      skipped: false,
      faces: [{id: 1}],
    })
  })

  it('matches after a successful detect when settings allow it', async () => {
    const events = []
    for await (const event of iterateFaceDetection({} as never, {persistCrops: false})) {
      events.push(event)
    }

    expect(detectMedia).toHaveBeenCalled()
    expect(matchMediaFaces).toHaveBeenCalledWith(
      expect.anything(),
      10,
      expect.objectContaining({force: false}),
    )
    expect(events[events.length - 1]).toMatchObject({type: 'complete', stopped: false})
  })

  it('skips match when matchAfterDetect is off', async () => {
    getFaceMatchSettings.mockReturnValueOnce({
      performerMetaId: 1,
      minConfidence: 0.5,
      candidateLimit: 5,
      mode: 'suggest',
      matchAfterDetect: false,
    })

    for await (const _ of iterateFaceDetection({} as never, {})) {
      // drain
    }

    expect(matchMediaFaces).not.toHaveBeenCalled()
  })
})
