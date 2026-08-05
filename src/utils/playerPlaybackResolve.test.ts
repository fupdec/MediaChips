import { describe, expect, it, vi } from 'vitest'
import type { MediaItem } from '@/types/stores'
import {
  getLiveChunkRelativeTime,
  isLoadSrcSessionStale,
  normalizeTranscodeMaxHeight,
  playbackErrorMessage,
  resolveCurrentPlaybackMediaId,
  resolveDirectPlaybackFallbackBegin,
  resolveEndedLiveNextStart,
  resolveFallbackResumeStreamStart,
  resolveLiveChunkEndMark,
  resolveLiveChunkRelativeSeekTarget,
  resolveLiveHandoffElapsedFromTimes,
  resolveLiveSeekStrategy,
  resolveLiveStreamCopyCompatible,
  resolveLiveStreamUrlOptions,
  resolveLiveTranscodeOfferable,
  resolvePlayableVideo,
  resolvePlaybackStartTime,
  shouldAdvanceAtSegmentEnd,
  shouldArmDirectSeekStallWatch,
  shouldHandOffLiveStreamChunk,
  shouldPreferDirectPlayback,
  shouldSkipLiveQualityChange,
  shouldTriggerDirectSeekStallFallback,
} from './playerPlaybackResolve'

describe('isLoadSrcSessionStale', () => {
  it('detects stale session id and inactive player', () => {
    expect(isLoadSrcSessionStale(1, 2, true)).toBe(true)
    expect(isLoadSrcSessionStale(2, 2, true)).toBe(false)
    expect(isLoadSrcSessionStale(2, 2, false)).toBe(true)
  })
})

describe('getLiveChunkRelativeTime', () => {
  it('returns offset inside the live chunk', () => {
    expect(getLiveChunkRelativeTime(670, 660)).toBe(10)
    expect(getLiveChunkRelativeTime(660, 660)).toBe(0)
    expect(getLiveChunkRelativeTime(659, 660)).toBe(0)
  })

  it('matches the 26:45 mark / 30s chunk boundary case', () => {
    expect(getLiveChunkRelativeTime(1605, 1590)).toBe(15)
    expect(getLiveChunkRelativeTime(1605, 1605)).toBe(0)
  })
})

describe('resolveLiveHandoffElapsedFromTimes', () => {
  it('prefers currentTime, then duration, then fallback', () => {
    expect(resolveLiveHandoffElapsedFromTimes(12, 30)).toBe(12)
    expect(resolveLiveHandoffElapsedFromTimes(0, 28)).toBe(28)
    expect(resolveLiveHandoffElapsedFromTimes(0, 0, 30)).toBe(30)
  })
})

describe('resolveLiveChunkRelativeSeekTarget', () => {
  it('skips tiny or already-applied seeks', () => {
    expect(resolveLiveChunkRelativeSeekTarget(0, 660, 660)).toBeNull()
    expect(resolveLiveChunkRelativeSeekTarget(10, 670, 660)).toBeNull()
    expect(resolveLiveChunkRelativeSeekTarget(0, 670, 660)).toBe(10)
  })
})

describe('normalizeTranscodeMaxHeight / playbackErrorMessage', () => {
  it('normalizes heights and error messages', () => {
    expect(normalizeTranscodeMaxHeight(720)).toBe('720')
    expect(normalizeTranscodeMaxHeight('bad')).toBe('0')
    expect(playbackErrorMessage(new Error('boom'), 'fallback')).toBe('boom')
    expect(playbackErrorMessage({message: 'x'}, 'fallback')).toBe('x')
    expect(playbackErrorMessage(null, 'fallback')).toBe('fallback')
  })
})

describe('shouldPreferDirectPlayback / resolveLiveStreamCopyCompatible', () => {
  it('prefers direct when forced or not required', () => {
    expect(shouldPreferDirectPlayback({
      transcodeRequired: false,
      forceDirectPlayback: false,
      liveTranscodeDisabled: false,
    })).toBe(true)
    expect(shouldPreferDirectPlayback({
      transcodeRequired: true,
      forceDirectPlayback: true,
      liveTranscodeDisabled: false,
    })).toBe(true)
    expect(shouldPreferDirectPlayback({
      transcodeRequired: true,
      forceDirectPlayback: false,
      liveTranscodeDisabled: false,
    })).toBe(false)
  })

  it('allows remux-copy only near t=0 without container_layout', () => {
    expect(resolveLiveStreamCopyCompatible({
      remuxCopy: true,
      reason: 'codec',
      streamStart: 0,
    })).toBe(true)
    expect(resolveLiveStreamCopyCompatible({
      remuxCopy: true,
      reason: 'container_layout',
      streamStart: 0,
    })).toBe(false)
    expect(resolveLiveStreamCopyCompatible({
      remuxCopy: true,
      reason: 'codec',
      streamStart: 1,
    })).toBe(false)
  })
})

describe('shouldAdvanceAtSegmentEnd', () => {
  it('requires active controls and time past segment end', () => {
    expect(shouldAdvanceAtSegmentEnd({
      segmentAdvancePending: false,
      active: true,
      hasControls: true,
      isLiveStreamSeeking: false,
      isAdvancingChunk: false,
      segmentEnd: 10,
      currentTime: 10,
    })).toBe(true)

    expect(shouldAdvanceAtSegmentEnd({
      segmentAdvancePending: false,
      active: true,
      hasControls: true,
      isLiveStreamSeeking: false,
      isAdvancingChunk: false,
      segmentEnd: 10,
      currentTime: 9.9,
    })).toBe(false)
  })
})

describe('live handoff / seek / start-time decisions', () => {
  it('resolves chunk end mark and handoff readiness', () => {
    expect(resolveLiveChunkEndMark(28)).toBe(28)
    expect(resolveLiveChunkEndMark(0.2)).toBe(30)
    expect(shouldHandOffLiveStreamChunk({
      usesLiveTranscode: true,
      hasPlayer: true,
      active: true,
      isAdvancingChunk: false,
      isLiveStreamSeeking: false,
      paused: false,
      relativeTime: 29.9,
      endMark: 30,
    })).toBe(true)
    expect(shouldHandOffLiveStreamChunk({
      usesLiveTranscode: true,
      hasPlayer: true,
      active: true,
      isAdvancingChunk: false,
      isLiveStreamSeeking: false,
      paused: false,
      relativeTime: 20,
      endMark: 30,
    })).toBe(false)
  })

  it('picks live seek strategy from buffer state', () => {
    expect(resolveLiveSeekStrategy({
      seekTime: 60,
      streamStart: 60,
      relative: 0,
      bufferedEnd: 0,
      hasSrc: true,
      isAdvancingChunk: false,
    }).kind).toBe('noop-at-stream-start')

    expect(resolveLiveSeekStrategy({
      seekTime: 70,
      streamStart: 60,
      relative: 10,
      bufferedEnd: 12,
      hasSrc: true,
      isAdvancingChunk: false,
    }).kind).toBe('relative-in-buffer')

    expect(resolveLiveSeekStrategy({
      seekTime: 90,
      streamStart: 60,
      relative: 30,
      bufferedEnd: 5,
      hasSrc: true,
      isAdvancingChunk: false,
    }).kind).toBe('restart-stream')
  })

  it('resolves loadSrc start time and offerable/quality gates', () => {
    expect(resolvePlaybackStartTime({
      explicitStart: 12,
      segmentStart: 3,
      playingClip: false,
      restorePlaybackTime: true,
      metaTime: 40,
      metadataDuration: 100,
    })).toBe(12)

    expect(resolvePlaybackStartTime({
      segmentStart: null,
      playingClip: false,
      restorePlaybackTime: true,
      metaTime: 40,
      metadataDuration: 100,
    })).toBe(40)

    expect(resolvePlaybackStartTime({
      segmentStart: null,
      playingClip: false,
      restorePlaybackTime: true,
      metaTime: 98,
      metadataDuration: 100,
    })).toBe(0)

    expect(resolveLiveTranscodeOfferable({
      transcodeRequired: true,
      transcodeUnsupportedFormatsEnabled: true,
      playableMode: 'direct',
    })).toBe(true)

    expect(shouldSkipLiveQualityChange({
      normalizedMaxHeight: '720',
      currentMaxHeight: '720',
      liveStreamCopyCompatible: false,
    })).toBe(true)
  })

  it('keeps mid-clip live next start when continuous handoff is unknown', () => {
    expect(resolveEndedLiveNextStart({
      continuousNextStart: null,
      absoluteTime: 42,
      segmentEnd: 90,
    })).toEqual({nextStart: 42, stillInsideSegment: true})

    expect(resolveEndedLiveNextStart({
      continuousNextStart: 60,
      absoluteTime: 42,
      segmentEnd: null,
    })).toEqual({nextStart: 60, stillInsideSegment: false})
  })
})

describe('direct seek stall / fallback gates', () => {
  it('arms and triggers stall fallback only on stuck direct decode', () => {
    expect(shouldArmDirectSeekStallWatch({
      usesLiveTranscode: false,
      fallbackAttempted: false,
    })).toBe(true)
    expect(shouldArmDirectSeekStallWatch({
      usesLiveTranscode: true,
      fallbackAttempted: false,
    })).toBe(false)

    expect(shouldTriggerDirectSeekStallFallback({
      active: true,
      usesLiveTranscode: false,
      hasSrc: true,
      seeking: true,
      readyState: 4,
    })).toBe(true)
    expect(shouldTriggerDirectSeekStallFallback({
      active: true,
      usesLiveTranscode: false,
      hasSrc: true,
      seeking: false,
      readyState: 4,
    })).toBe(false)
  })

  it('resolves fallback begin/resume/media id/url options', () => {
    expect(resolveDirectPlaybackFallbackBegin({
      inFlight: true,
      liveTranscodeDisabled: false,
      forceDirectPlayback: false,
    }).kind).toBe('busy')
    expect(resolveDirectPlaybackFallbackBegin({
      inFlight: false,
      liveTranscodeDisabled: true,
      forceDirectPlayback: false,
    }).kind).toBe('blocked')
    expect(resolveDirectPlaybackFallbackBegin({
      inFlight: false,
      liveTranscodeDisabled: false,
      forceDirectPlayback: false,
    }).kind).toBe('ok')

    expect(resolveFallbackResumeStreamStart(12.5, 3)).toBe(12.5)
    expect(resolveFallbackResumeStreamStart(0, 8)).toBe(8)

    expect(resolveCurrentPlaybackMediaId({
      currentLiveMediaId: null,
      liveTranscodeMediaId: null,
      mediaId: 9,
      playlistItemId: 2,
    })).toBe(9)

    expect(resolveLiveStreamUrlOptions({
      copyCompatible: true,
      accurateSeek: false,
    })).toEqual({copyCompatible: true})
  })
})

describe('resolvePlayableVideo', () => {
  const playlist: MediaItem[] = [
    {id: 1, path: '/missing.mp4'},
    {id: 2, path: '/available.mp4'},
  ]

  it('returns first playable file from playlist', async () => {
    const checkFileExists = vi.fn(async (filePath: string) => filePath === '/available.mp4')
    await expect(resolvePlayableVideo(playlist, playlist[0], checkFileExists))
      .resolves.toEqual({video: playlist[1], index: 1})
  })

  it('falls back to initial video when no file exists on disk', async () => {
    const checkFileExists = vi.fn(async () => false)
    await expect(resolvePlayableVideo(playlist, playlist[0], checkFileExists))
      .resolves.toEqual({video: playlist[0], index: 0})
  })

  it('returns null without initial video id', async () => {
    const checkFileExists = vi.fn(async () => false)
    await expect(resolvePlayableVideo([], {} as MediaItem, checkFileExists)).resolves.toBeNull()
  })

  it('resolves duplicate media ids by playlist key', async () => {
    const clipPlaylist: MediaItem[] = [
      {id: 1, path: '/same.mp4', key: 'clip-1', markId: 1, segmentStart: 0, segmentEnd: 5},
      {id: 1, path: '/same.mp4', key: 'clip-2', markId: 2, segmentStart: 10, segmentEnd: 20},
    ]
    const checkFileExists = vi.fn(async () => true)
    await expect(resolvePlayableVideo(clipPlaylist, clipPlaylist[1], checkFileExists))
      .resolves.toEqual({video: clipPlaylist[1], index: 1})
  })
})
