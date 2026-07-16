import {describe, it, expect} from 'vitest'
import {
  buildFfmpegLiveArgs,
  buildSessionKey,
  shouldRejectDuplicateStream,
} from '../../api/services/transcode/liveStreamTranscode.js'

describe('liveStreamTranscode session keys', () => {
  it('includes start time and max height in the session key', () => {
    expect(buildSessionKey('abc123', 120, 720)).toBe('abc123@120.00@720')
  })

  it('uses distinct keys for different quality at the same chunk', () => {
    const streamKey = 'file-hash'
    const start = 240

    expect(buildSessionKey(streamKey, start, 1080)).not.toBe(
      buildSessionKey(streamKey, start, 720),
    )
  })

  it('uses auto height marker when max height is omitted', () => {
    expect(buildSessionKey('abc123', 0)).toBe('abc123@0.00@auto')
  })

  it('appends copy marker for remux sessions', () => {
    expect(buildSessionKey('abc123', 0, 720, true)).toBe('abc123@0.00@720@copy')
  })
})

describe('buildFfmpegLiveArgs', () => {
  it('uses stream copy for remux mode', () => {
    const args = buildFfmpegLiveArgs({
      inputPath: '/videos/sample.mp4',
      startTime: 30,
      duration: 120,
      copyCodecs: true,
      maxHeight: 720,
    })

    expect(args).toContain('-c')
    expect(args).toContain('copy')
    expect(args).not.toContain('libx264')
    expect(args).not.toContain('-vf')
  })

  it('uses precise output-only seek when accurateSeek is set without keyframe', () => {
    const args = buildFfmpegLiveArgs({
      inputPath: '/videos/sample.mp4',
      startTime: 641,
      duration: 30,
      copyCodecs: false,
      accurateSeek: true,
    })

    // Accurate flag must not decode from t=0 — use the fast margin seek.
    const inputIndex = args.indexOf('-i')
    const preInputSs = args.slice(0, inputIndex).lastIndexOf('-ss')
    const postInputSs = args.indexOf('-ss', inputIndex)

    expect(args[preInputSs + 1]).toBe('621')
    expect(postInputSs).toBeGreaterThan(inputIndex)
    expect(args[postInputSs + 1]).toBe('20')
  })

  it('caps huge keyframe output skips so startup stays fast', () => {
    const args = buildFfmpegLiveArgs({
      inputPath: '/videos/sample.mp4',
      startTime: 641,
      duration: 30,
      copyCodecs: false,
      accurateSeek: true,
      inputSeekTime: 485,
      outputSeekTime: 156,
    })

    const inputIndex = args.indexOf('-i')
    const preInputSs = args.slice(0, inputIndex).lastIndexOf('-ss')
    const postInputSs = args.indexOf('-ss', inputIndex)

    // 156s output skip is capped to 20s; overflow is pushed into input seek.
    expect(args[preInputSs + 1]).toBe('621')
    expect(postInputSs).toBeGreaterThan(inputIndex)
    expect(args[postInputSs + 1]).toBe('20')
  })

  it('uses precise output seek when re-encoding from a mid-file mark', () => {
    const args = buildFfmpegLiveArgs({
      inputPath: '/videos/sample.mp4',
      startTime: 368,
      duration: 30,
      copyCodecs: false,
    })

    const inputIndex = args.indexOf('-i')
    const preInputSs = args.slice(0, inputIndex).lastIndexOf('-ss')
    const postInputSs = args.indexOf('-ss', inputIndex)

    expect(args[preInputSs + 1]).toBe('348')
    expect(postInputSs).toBeGreaterThan(inputIndex)
    expect(args[postInputSs + 1]).toBe('20')
  })

  it('uses output-only seek for early marks while re-encoding', () => {
    const args = buildFfmpegLiveArgs({
      inputPath: '/videos/sample.mp4',
      startTime: 8,
      duration: 30,
      copyCodecs: false,
    })

    expect(args.indexOf('-ss')).toBeGreaterThan(args.indexOf('-i'))
    expect(args[args.indexOf('-ss') + 1]).toBe('8')
  })
})

describe('shouldRejectDuplicateStream', () => {
  it('rejects duplicate stream within 5 seconds', () => {
    const now = 10_000
    expect(shouldRejectDuplicateStream({startedAt: 6_500, stopped: false}, now)).toBe(true)
  })

  it('allows a new stream after 5 seconds', () => {
    const now = 10_000
    expect(shouldRejectDuplicateStream({startedAt: 4_000, stopped: false}, now)).toBe(false)
  })

  it('ignores stopped streams', () => {
    expect(shouldRejectDuplicateStream({startedAt: 9_999, stopped: true}, 10_000)).toBe(false)
  })
})
