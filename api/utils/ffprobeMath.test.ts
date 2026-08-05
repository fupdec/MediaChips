import {describe, expect, it} from 'vitest'
import {
  acceptKeyframeHit,
  getVideoStreamDimensions,
  normalizeFfprobePayload,
  pickBestKeyframeFromPackets,
  pickBestKeyframePts,
  resolveThumbnailSeekSeconds,
} from './ffprobeMath'

describe('ffprobeMath', () => {
  it('normalizes probe numbers and dimensions', () => {
    const normalized = normalizeFfprobePayload({
      format: {duration: '12.5', bit_rate: '1000'},
      streams: [{codec_type: 'video', width: '1920', height: '1080'}],
    })
    expect(normalized.format.duration).toBe(12.5)
    expect(normalized.streams[0].width).toBe(1920)
    expect(getVideoStreamDimensions(normalized)).toEqual({
      width: 1920,
      height: 1080,
      aspectRatio: 1920 / 1080,
    })
  })

  it('resolves thumbnail seek and picks keyframes', () => {
    expect(resolveThumbnailSeekSeconds(100, 0.5)).toBe(50)
    expect(resolveThumbnailSeekSeconds(0)).toBe(1)
    expect(pickBestKeyframePts('1.0\n9.5\n10.2\n', 10)).toBe(9.5)
    expect(pickBestKeyframeFromPackets('1.0,K_\n9.5,K_\n8.0,_\n', 10)).toBe(9.5)
    expect(acceptKeyframeHit(0, 10)).toBeNull()
    expect(acceptKeyframeHit(8, 10)).toBe(8)
  })
})
