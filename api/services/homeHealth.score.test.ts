import {describe, expect, it, vi} from 'vitest'

vi.mock('./mediaFingerprintBackfill', () => ({
  getFingerprintBackfillStatus: vi.fn(),
  getContentHashBackfillStatus: vi.fn(),
  getOshashBackfillStatus: vi.fn(),
}))
vi.mock('./videoCodecBackfill', () => ({ getVideoCodecBackfillStatus: vi.fn() }))
vi.mock('./videoImagesGeneration', () => ({ getVideoImagesGenerationStatus: vi.fn() }))
vi.mock('./imageThumbsGeneration', () => ({ getImageThumbsGenerationStatus: vi.fn() }))
vi.mock('./mediaClipEmbeddings', () => ({ getClipEmbeddingBackfillStatus: vi.fn() }))
vi.mock('./faceDetector', () => ({ getFaceDetectionStatus: vi.fn() }))
vi.mock('./tagImageAiUpscale', () => ({
  getTagImageAiUpscaleStatus: vi.fn(),
  hasAnyUpscaleCandidateFiles: vi.fn(),
  isTagImageAiUpscaleDone: vi.fn(),
  TAG_AI_UPSCALE_DOWNLOAD_SIZE_MB: 50,
}))
vi.mock('./directorySize', () => ({ getDirectorySize: vi.fn(async () => 0) }))

import {buildHealthQueue, computeHealthScore, isClipModelReady} from './homeHealth'

describe('computeHealthScore', () => {
  it('returns 100 when everything is healthy', () => {
    const score = computeHealthScore({
      generatedImages: {byType: {}, totalPending: 0},
      imageThumbs: {total: 0, pending: 0},
      clip: {total: 0, pending: 0},
      fingerprint: {total: 0, pending: 0},
      faces: {total: 0, pending: 0},
      videoCodec: {total: 0, pending: 0},
      duplicates: {byFilesize: 0, byFingerprint: 0, byVisualHash: 0},
      tagImageAiUpscale: {done: true, suggested: false},
    })
    expect(score).toBe(100)
  })

  it('deducts for pending visuals, clip, and duplicates', () => {
    const score = computeHealthScore({
      generatedImages: {
        byType: {
          preview: {total: 10, pending: 10},
          grid: {total: 10, pending: 0},
          marks: {total: 10, pending: 0},
        },
        totalPending: 10,
      },
      imageThumbs: {total: 0, pending: 0},
      clip: {total: 10, pending: 10},
      fingerprint: {total: 10, pending: 0},
      faces: {total: 10, pending: 0},
      videoCodec: {total: 10, pending: 0},
      duplicates: {byFilesize: 12, byFingerprint: 0, byVisualHash: 0},
      tagImageAiUpscale: {done: true, suggested: false},
    })
    // visuals ~ -8 (10/30 * 25), clip -20, duplicates -10 => ~62
    expect(score).toBeLessThan(80)
    expect(score).toBeGreaterThan(50)
  })
})

describe('buildHealthQueue', () => {
  it('orders auto-fixable items and always appends missing tip', () => {
    const queue = buildHealthQueue({
      generatedImages: {
        byType: {preview: {total: 2, pending: 2}},
        totalPending: 2,
      },
      imageThumbs: {total: 0, pending: 0},
      fingerprint: {total: 5, pending: 3},
      videoCodec: {total: 5, pending: 1},
      clip: {total: 4, pending: 2, modelStatus: 'downloaded'},
      faces: {total: 8, pending: 4},
      duplicates: {byFilesize: 2, byFingerprint: 0, byVisualHash: 0},
      tagImageAiUpscale: {done: true, suggested: false},
    })

    expect(queue.map((item) => item.id)).toEqual([
      'visuals',
      'fingerprint',
      'codec',
      'clip',
      'faces',
      'duplicates',
      'missing',
    ])
    expect(queue.find((item) => item.id === 'clip')?.autoFixable).toBe(true)
    expect(queue.find((item) => item.id === 'faces')?.autoFixable).toBe(false)
    expect(queue.find((item) => item.id === 'missing')?.count).toBe(0)
  })

  it('marks clip as not auto-fixable when model is missing', () => {
    const queue = buildHealthQueue({
      generatedImages: {byType: {}, totalPending: 0},
      imageThumbs: {total: 0, pending: 0},
      fingerprint: {total: 0, pending: 0},
      videoCodec: {total: 0, pending: 0},
      clip: {total: 3, pending: 3, modelStatus: 'not_downloaded'},
      faces: {total: 0, pending: 0},
      duplicates: {byFilesize: 0, byFingerprint: 0, byVisualHash: 0},
      tagImageAiUpscale: {done: true, suggested: false},
    })
    expect(queue.find((item) => item.id === 'clip')?.autoFixable).toBe(false)
  })
})

describe('isClipModelReady', () => {
  it('accepts downloaded/loaded/loading', () => {
    expect(isClipModelReady('downloaded')).toBe(true)
    expect(isClipModelReady('loaded')).toBe(true)
    expect(isClipModelReady('loading')).toBe(true)
    expect(isClipModelReady('not_downloaded')).toBe(false)
  })
})
