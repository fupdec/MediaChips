import {describe, expect, it} from 'vitest'
import {
  acceptKeyframeHit,
  estimateBitrate,
  getVideoStreamDimensions,
  normalizeFfprobePayload,
  parseFrameRate,
  pickBestKeyframeFromPackets,
  pickBestKeyframePts,
  pickLastPtsFromCsv,
  resolveDurationSeconds,
  resolveStreamFps,
  resolveThumbnailSeekSeconds,
} from './ffprobeMath'

describe('ffprobeMath', () => {
  it('normalizes probe numbers and dimensions', () => {
    const normalized = normalizeFfprobePayload({
      format: {duration: '12.5', bit_rate: '1000', size: '5000'},
      streams: [{codec_type: 'video', width: '1920', height: '1080'}],
    })
    expect(normalized.format.duration).toBe(12.5)
    expect(normalized.format.bit_rate).toBe(1000)
    expect(normalized.format.size).toBe(5000)
    expect(normalized.streams[0].width).toBe(1920)
    expect(getVideoStreamDimensions(normalized)).toEqual({
      width: 1920,
      height: 1080,
      aspectRatio: 1920 / 1080,
    })
  })

  it('treats missing or invalid duration/bitrate as empty', () => {
    const normalized = normalizeFfprobePayload({
      format: {duration: 'N/A', bit_rate: 'N/A'},
      streams: [],
    })
    expect(normalized.format.duration).toBe(0)
    expect(normalized.format.bit_rate).toBeUndefined()
  })

  it('resolves duration from packet PTS when container omits it', () => {
    expect(resolveDurationSeconds(0, 244.7)).toBe(244.7)
    expect(resolveDurationSeconds(12.5, 244.7)).toBe(12.5)
    expect(resolveDurationSeconds(0, 0.2)).toBeNull()
    expect(pickLastPtsFromCsv('1.0\n244.5\n244.7\n')).toBe(244.7)
  })

  it('parses frame rates and estimates bitrate', () => {
    expect(parseFrameRate('1000/33')).toBeCloseTo(30.303, 2)
    expect(parseFrameRate('0/0')).toBeUndefined()
    expect(resolveStreamFps({avg_frame_rate: '1000/33', r_frame_rate: '60/1'})).toBe(31)
    expect(estimateBitrate(111266266, 244.7)).toBe(Math.round((111266266 * 8) / 244.7))
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
