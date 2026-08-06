import {describe, expect, it} from 'vitest'
import {
  buildMissingPlaybackPlan,
  isPlayabilityProbeIncomplete,
  resolveLiveStreamCopyCodecs,
  resolvePlaybackPlanFromPlayability,
  type PlayabilityResult,
} from './playbackPlanResolve'

function playability(overrides: Partial<PlayabilityResult> = {}): PlayabilityResult {
  return {
    playable: true,
    reason: null,
    videoCodec: 'h264',
    audioCodec: 'aac',
    duration: 120,
    needsRemux: false,
    ...overrides,
  }
}

describe('buildMissingPlaybackPlan', () => {
  it('returns the missing-file plan', () => {
    expect(buildMissingPlaybackPlan()).toEqual({
      mode: 'missing',
      transcodeRequired: false,
      transcodeStatus: 'none',
      progress: 100,
      error: 'File not found',
      reason: 'missing',
    })
  })
})

describe('resolvePlaybackPlanFromPlayability', () => {
  it('keeps container_layout on direct first (fallback remux is client-side)', () => {
    const plan = resolvePlaybackPlanFromPlayability({
      playability: playability({needsRemux: true, reason: 'container_layout'}),
      transcodeEnabled: true,
    })
    expect(plan).toMatchObject({
      mode: 'direct',
      transcodeRequired: false,
      transcodeStatus: 'none',
      progress: 100,
      reason: 'container_layout',
    })
    expect(plan.streamPlayback).toBeUndefined()
    expect(plan.remuxCopy).toBeUndefined()
    expect(plan.playability?.needsRemux).toBe(true)
  })

  it('returns direct for browser-playable files', () => {
    expect(resolvePlaybackPlanFromPlayability({
      playability: playability(),
      transcodeEnabled: true,
    })).toMatchObject({
      mode: 'direct',
      transcodeRequired: false,
      transcodeStatus: 'none',
      progress: 100,
    })
  })

  it('marks unsupported when transcode is disabled', () => {
    expect(resolvePlaybackPlanFromPlayability({
      playability: playability({playable: false, reason: 'video_codec'}),
      transcodeEnabled: false,
    })).toMatchObject({
      mode: 'unsupported',
      transcodeRequired: false,
      transcodeEnabled: false,
      transcodeStatus: 'disabled',
      reason: 'video_codec',
    })
  })

  it('streams when codecs need transcode and it is enabled', () => {
    expect(resolvePlaybackPlanFromPlayability({
      playability: playability({playable: false, reason: 'video_codec'}),
      transcodeEnabled: true,
    })).toMatchObject({
      mode: 'stream',
      transcodeRequired: true,
      streamPlayback: true,
      reason: 'video_codec',
    })
  })
})

describe('resolveLiveStreamCopyCodecs', () => {
  it('allows copy only near t=0 for remux-safe playable files', () => {
    expect(resolveLiveStreamCopyCodecs({
      requestedCopy: true,
      playable: true,
      needsRemux: false,
      streamStart: 0,
    })).toBe(true)

    expect(resolveLiveStreamCopyCodecs({
      requestedCopy: true,
      playable: true,
      needsRemux: true,
      streamStart: 0,
    })).toBe(false)

    expect(resolveLiveStreamCopyCodecs({
      requestedCopy: true,
      playable: true,
      needsRemux: false,
      streamStart: 1,
    })).toBe(false)

    expect(resolveLiveStreamCopyCodecs({
      requestedCopy: false,
      playable: true,
      needsRemux: false,
      streamStart: 0,
    })).toBe(false)
  })
})

describe('isPlayabilityProbeIncomplete', () => {
  it('retries empty or codec-less probes', () => {
    expect(isPlayabilityProbeIncomplete(null)).toBe(true)
    expect(isPlayabilityProbeIncomplete({streams: []})).toBe(true)
    expect(isPlayabilityProbeIncomplete({
      streams: [{codec_type: 'video'}],
    })).toBe(true)
    expect(isPlayabilityProbeIncomplete({
      streams: [{codec_type: 'video', codec_name: 'h264'}],
    })).toBe(false)
  })

  it('requires an audio codec for audio-only probes', () => {
    expect(isPlayabilityProbeIncomplete({
      streams: [{codec_type: 'video', codec_name: 'h264'}],
    }, {audioOnly: true})).toBe(true)
    expect(isPlayabilityProbeIncomplete({
      streams: [{codec_type: 'audio', codec_name: 'aac'}],
    }, {audioOnly: true})).toBe(false)
  })
})
