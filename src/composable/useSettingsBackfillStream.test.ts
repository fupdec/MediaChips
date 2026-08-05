import {describe, expect, it} from 'vitest'
import {
  FINGERPRINT_BACKFILL,
  VIDEO_CODEC_BACKFILL,
  VISUAL_HASH_BACKFILL,
} from './useSettingsBackfillStream'

describe('settings backfill configs', () => {
  it('maps UI panels to typedApi backfill kinds', () => {
    expect(FINGERPRINT_BACKFILL.kind).toBe('fingerprint')
    expect(VISUAL_HASH_BACKFILL.kind).toBe('visualHash')
    expect(VIDEO_CODEC_BACKFILL.kind).toBe('videoCodec')
    expect(VIDEO_CODEC_BACKFILL.mode).toBe('codec')
  })
})
