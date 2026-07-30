import {describe, expect, it, vi} from 'vitest'

vi.mock('./mediaFingerprintBackfill', () => ({
  getFingerprintBackfillStatus: vi.fn(async () => ({total: 10, pending: 3, hashed: 7})),
  getContentHashBackfillStatus: vi.fn(async () => ({total: 10, pending: 1, hashed: 9})),
  getOshashBackfillStatus: vi.fn(async () => ({total: 8, pending: 2, hashed: 6})),
}))

vi.mock('./videoCodecBackfill', () => ({
  getVideoCodecBackfillStatus: vi.fn(async () => ({total: 8, pending: 4, filled: 4})),
}))

vi.mock('./videoImagesGeneration', () => ({
  getVideoImagesGenerationStatus: vi.fn(async () => {
    throw new Error('should not be called in lite health')
  }),
}))

vi.mock('./imageThumbsGeneration', () => ({
  getImageThumbsGenerationStatus: vi.fn(async () => {
    throw new Error('should not be called in lite health')
  }),
}))

vi.mock('./tagImageAiUpscale', () => ({
  isTagImageAiUpscaleDone: vi.fn(() => false),
  hasAnyUpscaleCandidateFiles: vi.fn(async () => true),
  getTagImageAiUpscaleStatus: vi.fn(async () => ({
    done: false,
    pendingCount: 2,
    suggested: true,
    downloadSizeMb: 50,
    byType: {},
  })),
  TAG_AI_UPSCALE_DOWNLOAD_SIZE_MB: 50,
}))

describe('getHomeHealthLite', () => {
  it('returns cheap checks without FS-heavy generators', async () => {
    const {getHomeHealthLite} = await import('./homeHealth')
    const data = await getHomeHealthLite({
      path: '/tmp/db',
      drizzle: {},
      config: {id: 1, name: 'Test'},
    } as never)

    expect(data.fingerprint?.pending).toBe(3)
    expect(data.contentHash?.pending).toBe(1)
    expect(data.oshash?.pending).toBe(2)
    expect(data.videoCodec?.pending).toBe(4)
    expect(data.tagImageAiUpscale).toEqual({
      done: false,
      suggested: true,
      downloadSizeMb: 50,
    })
  })
})
