import {describe, expect, it} from 'vitest'
import {
  CLIP_EMBEDDING_BACKFILL,
  FINGERPRINT_BACKFILL,
  MEDIA_CREATED_BACKFILL,
  VIDEO_CODEC_BACKFILL,
  VISUAL_HASH_BACKFILL,
} from './useSettingsBackfillStream'

describe('settings backfill configs', () => {
  it('maps UI panels to typedApi backfill kinds', () => {
    expect(FINGERPRINT_BACKFILL.kind).toBe('fingerprint')
    expect(VISUAL_HASH_BACKFILL.kind).toBe('visualHash')
    expect(CLIP_EMBEDDING_BACKFILL.kind).toBe('clipEmbedding')
    expect(VIDEO_CODEC_BACKFILL.kind).toBe('videoCodec')
    expect(VIDEO_CODEC_BACKFILL.mode).toBe('codec')
    expect(MEDIA_CREATED_BACKFILL.kind).toBe('mediaCreated')
    expect(MEDIA_CREATED_BACKFILL.mode).toBe('codec')
  })
})
