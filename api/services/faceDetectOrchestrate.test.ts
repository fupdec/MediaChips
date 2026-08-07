import {describe, expect, it, vi, beforeEach} from 'vitest'

const {
  detectMedia,
  prepareDetectModel,
  getFaceDetectSettings,
  purgeAllFaceCrops,
  prepareEmbedModel,
  getFaceMatchSettings,
  loadFaceMatchBatchContext,
  matchMediaFaces,
  prepareGenderModel,
  resolveExistingPath,
  findByType,
  findByMediaType,
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
    autoBlindTags: false,
  })),
  loadFaceMatchBatchContext: vi.fn((_db, settings) => ({
    settings: settings || {
      performerMetaId: 1,
      minConfidence: 0.5,
      candidateLimit: 5,
      mode: 'suggest',
      matchAfterDetect: true,
      autoBlindTags: false,
    },
    enrollments: [{tagId: 9, embedding: new Float32Array(512)}],
  })),
  matchMediaFaces: vi.fn(async () => ({matched: 1})),
  prepareGenderModel: vi.fn(async function* () {}),
  resolveExistingPath: vi.fn(async (path: string) => path),
  findByType: vi.fn(() => ({id: 2})),
  findByMediaType: vi.fn(() => [{id: 10, path: '/a.mp4'}]),
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
  loadFaceMatchBatchContext,
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
    findByMediaType,
  }),
}))

import {iterateFaceDetection} from './faceDetectOrchestrate'

describe('iterateFaceDetection match-after-detect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findByMediaType.mockReturnValue([{id: 10, path: '/a.mp4'}])
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
    expect(loadFaceMatchBatchContext).toHaveBeenCalledTimes(1)
    expect(matchMediaFaces).toHaveBeenCalledWith(
      expect.anything(),
      10,
      expect.objectContaining({
        force: false,
        context: expect.objectContaining({
          settings: expect.objectContaining({performerMetaId: 1}),
        }),
      }),
    )
    expect(events[events.length - 1]).toMatchObject({type: 'complete', stopped: false})
  })

  it('loads match context once across multiple successful detects', async () => {
    findByMediaType.mockReturnValueOnce([
      {id: 10, path: '/a.mp4'},
      {id: 11, path: '/b.mp4'},
    ])
    detectMedia
      .mockResolvedValueOnce({
        mediaId: 10,
        mediaPath: '/a.mp4',
        failed: false,
        missing: false,
        skipped: false,
        faces: [{id: 1}],
      })
      .mockResolvedValueOnce({
        mediaId: 11,
        mediaPath: '/b.mp4',
        failed: false,
        missing: false,
        skipped: false,
        faces: [{id: 2}],
      })

    for await (const _ of iterateFaceDetection({} as never, {})) {
      // drain
    }

    expect(loadFaceMatchBatchContext).toHaveBeenCalledTimes(1)
    expect(matchMediaFaces).toHaveBeenCalledTimes(2)
    const firstCall = matchMediaFaces.mock.calls[0] as unknown as [
      unknown,
      number,
      {context?: unknown}?,
    ]
    const secondCall = matchMediaFaces.mock.calls[1] as unknown as [
      unknown,
      number,
      {context?: unknown}?,
    ]
    expect(firstCall[2]?.context).toBe(secondCall[2]?.context)
  })

  it('skips match when matchAfterDetect is off', async () => {
    getFaceMatchSettings.mockReturnValueOnce({
      performerMetaId: 1,
      minConfidence: 0.5,
      candidateLimit: 5,
      mode: 'suggest',
      matchAfterDetect: false,
      autoBlindTags: false,
    })

    for await (const _ of iterateFaceDetection({} as never, {})) {
      // drain
    }

    expect(loadFaceMatchBatchContext).not.toHaveBeenCalled()
    expect(matchMediaFaces).not.toHaveBeenCalled()
  })
})
