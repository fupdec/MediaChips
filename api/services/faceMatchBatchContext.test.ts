/**
 * @vitest-environment node
 */
import {beforeEach, describe, expect, it, vi} from 'vitest'

const {
  findByMetaId,
  findByMediaId,
  getFaceMatchSettings,
  parseEnrollmentRefs,
  resolveMatchMediaFacesGate,
} = vi.hoisted(() => ({
  findByMetaId: vi.fn(() => [
    {tagId: 1, embedding: '[1]'},
    {tagId: 2, embedding: '[2]'},
  ]),
  findByMediaId: vi.fn(() => [{id: 10}]),
  getFaceMatchSettings: vi.fn(() => ({
    performerMetaId: 7,
    minConfidence: 0.5,
    candidateLimit: 5,
    mode: 'suggest',
    matchAfterDetect: true,
    autoBlindTags: false,
  })),
  parseEnrollmentRefs: vi.fn((rows: Array<{tagId: number}>) => (
    rows.map((row) => ({tagId: row.tagId, embedding: new Float32Array(2)}))
  )),
  resolveMatchMediaFacesGate: vi.fn(() => ({
    ok: false,
    result: {matched: 0, applied: 0, skipped: 0, faces: 0, error: 'gated'},
  })),
}))

vi.mock('../db/repositories/faceEnrollments', () => ({
  createFaceEnrollmentsRepository: () => ({findByMetaId}),
}))

vi.mock('../db/repositories/faces', () => ({
  createFacesRepository: () => ({findByMediaId}),
}))

vi.mock('./faceMatchScoring', async () => {
  const actual = await vi.importActual<typeof import('./faceMatchScoring')>('./faceMatchScoring')
  return {
    ...actual,
    parseEnrollmentRefs,
  }
})

vi.mock('./faceMediaMatchResolve', async () => {
  const actual = await vi.importActual<typeof import('./faceMediaMatchResolve')>('./faceMediaMatchResolve')
  return {
    ...actual,
    resolveMatchMediaFacesGate,
  }
})

vi.mock('./faceSettingsParse', () => ({
  parseFaceMatchSettingsFromMap: () => getFaceMatchSettings(),
}))

vi.mock('../db/repositories/settings', () => ({
  createSettingsRepository: () => ({findByOptions: () => []}),
}))

vi.mock('../db/repositories/meta', () => ({
  createMetaRepository: () => ({findAll: () => []}),
}))

import {loadFaceMatchBatchContext, matchMediaFaces} from './faceRecognition'

describe('face match batch context', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads and parses enrollments once for reuse', () => {
    const context = loadFaceMatchBatchContext({drizzle: {}, sqlite: {}} as never)
    expect(findByMetaId).toHaveBeenCalledTimes(1)
    expect(parseEnrollmentRefs).toHaveBeenCalledTimes(1)
    expect(context.settings.performerMetaId).toBe(7)
    expect(context.enrollments).toHaveLength(2)
  })

  it('reuses preloaded enrollments in matchMediaFaces', async () => {
    const context = loadFaceMatchBatchContext({drizzle: {}, sqlite: {}} as never)
    findByMetaId.mockClear()
    parseEnrollmentRefs.mockClear()

    await matchMediaFaces({drizzle: {}, sqlite: {}} as never, 42, {context})

    expect(findByMediaId).toHaveBeenCalledWith(42)
    expect(findByMetaId).not.toHaveBeenCalled()
    expect(parseEnrollmentRefs).not.toHaveBeenCalled()
    expect(resolveMatchMediaFacesGate).toHaveBeenCalledWith({
      metaId: 7,
      facesCount: 1,
      enrollmentsCount: 2,
    })
  })
})
