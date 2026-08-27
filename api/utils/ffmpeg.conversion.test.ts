/** @vitest-environment node */
import {describe, expect, it} from 'vitest'
import {buildConversionArgs, buildConversionScale, buildTrimCopyArgs, parseFfmpegProgressTime, resolveConversionVideoEncoder, shouldUseHardwareVideoEncoder} from './ffmpeg'

describe('FFmpeg progress parsing', () => {
  it('treats both FFmpeg out_time fields as microseconds', () => {
    expect(parseFfmpegProgressTime('out_time_us=4900000')).toBeCloseTo(4.9)
    expect(parseFfmpegProgressTime('out_time_ms=4900000')).toBeCloseTo(4.9)
    expect(parseFfmpegProgressTime('out_time=00:01:02.500000')).toBeCloseTo(62.5)
    expect(parseFfmpegProgressTime('speed=2x')).toBeNull()
  })
})

describe('video conversion ffmpeg arguments', () => {
  it('builds HEVC and H.264 profiles without upscaling', () => {
    expect(buildConversionScale('original')).toBeNull()
    expect(buildConversionScale(720)).toContain('min(720\\,ih)')
    const hevc = buildConversionArgs('/in.mov', '/out.mp4', {codec: 'hevc', resolution: 1080, quality: 'balanced'})
    expect(hevc).toContain('-c:v')
    expect(hevc).toContain(resolveConversionVideoEncoder('hevc'))
    if (shouldUseHardwareVideoEncoder() && process.platform === 'darwin') {
      expect(hevc).toEqual(expect.arrayContaining(['-q:v', '55', '-tag:v', 'hvc1']))
    } else {
      expect(hevc).toEqual(expect.arrayContaining(['-crf', '24', '-preset', 'fast']))
    }
    expect(hevc).toEqual(expect.arrayContaining(['-progress', 'pipe:2', '-nostats', '-c:a', 'aac', '-profile:a', 'aac_low', '-f', 'mp4']))
    const h264 = buildConversionArgs('/in.mov', '/out.mp4', {codec: 'h264', resolution: 'original', quality: 'economy'})
    expect(h264).toContain(resolveConversionVideoEncoder('h264'))
    if (shouldUseHardwareVideoEncoder() && process.platform === 'darwin') {
      expect(h264).toEqual(expect.arrayContaining(['-q:v', '70', '-profile:v', 'high']))
    } else {
      expect(h264).toEqual(expect.arrayContaining(['-crf', '28', '-preset', 'veryfast']))
    }
    expect(h264).not.toContain('-vf')
    expect(h264[h264.length - 2]).toBe('mp4')
  })

  it('rejects unsupported quality and resolution', () => {
    expect(() => buildConversionArgs('in', 'out', {codec: 'hevc', resolution: 720, quality: 'bad' as never})).toThrow()
    expect(() => buildConversionScale(999 as never)).toThrow()
  })
})

describe('video trim ffmpeg arguments', () => {
  it('stream-copies with input seek and faststart for mp4', () => {
    const args = buildTrimCopyArgs('/in.mkv', '/out.mp4', 12, 30)
    expect(args).toEqual(expect.arrayContaining([
      '-ss', '12',
      '-i', '/in.mkv',
      '-t', '30',
      '-c', 'copy',
      '-avoid_negative_ts', 'make_zero',
      '-movflags', '+faststart',
    ]))
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'))
  })
})
