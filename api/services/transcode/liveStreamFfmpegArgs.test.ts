import {describe, expect, it} from 'vitest'
import {
  buildFfmpegLiveArgs,
  buildSessionKey,
  shouldRejectDuplicateStream,
} from './liveStreamFfmpegArgs'

describe('liveStreamFfmpegArgs', () => {
  it('builds session keys with height and copy markers', () => {
    expect(buildSessionKey('abc123', 120, 720)).toBe('abc123@120.00@720')
    expect(buildSessionKey('abc123', 0)).toBe('abc123@0.00@auto')
    expect(buildSessionKey('abc123', 0, 720, true)).toBe('abc123@0.00@720@copy')
  })

  it('rejects fresh duplicate streams', () => {
    expect(shouldRejectDuplicateStream({startedAt: Date.now() - 1000})).toBe(true)
    expect(shouldRejectDuplicateStream({startedAt: Date.now() - 6000})).toBe(false)
    expect(shouldRejectDuplicateStream({startedAt: Date.now(), stopped: true})).toBe(false)
  })

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
    expect(args[preInputSs + 1]).toBe('621')
  })
})
