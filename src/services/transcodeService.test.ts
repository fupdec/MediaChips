import {describe, it, expect, vi, beforeEach} from 'vitest'
import {
  buildLiveStreamUrl,
  buildVideoStreamUrl,
  playLiveStreamWhenReady,
  playWhenReady,
  resolvePreviewVideoUrl,
  shouldAttemptDirectPlaybackFallback,
} from '@/services/transcodeService'

vi.mock('@/services/typedApi', () => ({
  typedApi: {
    getVideoPlayable: vi.fn(),
  },
}))

import {typedApi} from '@/services/typedApi'

const mockGetVideoPlayable = vi.mocked(typedApi.getVideoPlayable)

describe('transcodeService urls', () => {
  const buildApiUrl = (path: string) => `http://localhost:12321${path}`

  it('builds live stream url with start offset', () => {
    const url = buildLiveStreamUrl(buildApiUrl, 42, 125.5)
    expect(url).toContain('/api/video/42/transcode/stream')
    expect(url).toContain('start=120')
  })

  it('builds live stream url with max height', () => {
    const url = buildLiveStreamUrl(buildApiUrl, 42, 0, '720')
    expect(url).toContain('maxHeight=720')
  })

  it('builds remux copy live stream url without max height', () => {
    const url = buildLiveStreamUrl(buildApiUrl, 42, 0, '720', {copyCompatible: true})
    expect(url).toContain('copy=1')
    expect(url).not.toContain('maxHeight=')
  })

  it('builds direct video stream url', () => {
    const url = buildVideoStreamUrl(buildApiUrl, 7, 'auto')
    expect(url).toContain('/api/video/7?source=auto')
  })
})

describe('resolvePreviewVideoUrl', () => {
  const buildApiUrl = (path: string) => `http://localhost:12321${path}`

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses live stream url when transcode is required', async () => {
    mockGetVideoPlayable.mockResolvedValue({
      data: {transcodeRequired: true, mode: 'stream', streamPlayback: true},
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as never,
    })

    const url = await resolvePreviewVideoUrl(buildApiUrl, 15, 30)
    expect(url).toContain('/api/video/15/transcode/stream')
    expect(url).toContain('start=30')
  })

  it('returns null when format is unsupported and transcode is disabled', async () => {
    mockGetVideoPlayable.mockResolvedValue({
      data: {mode: 'unsupported', transcodeRequired: false},
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as never,
    })

    expect(await resolvePreviewVideoUrl(buildApiUrl, 15)).toBeNull()
  })

  it('falls back to direct stream url when playable check fails', async () => {
    mockGetVideoPlayable.mockRejectedValue(new Error('offline'))

    const url = await resolvePreviewVideoUrl(buildApiUrl, 9)
    expect(url).toContain('/api/video/9?source=auto')
  })
})

describe('playLiveStreamWhenReady', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('retries live stream playback after load failure', async () => {
    const videoEl = {
      src: '',
      readyState: 4,
      error: {code: 2},
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      play: vi.fn()
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValueOnce(undefined),
    } as unknown as HTMLVideoElement

    let attempt = 0
    const promise = playLiveStreamWhenReady(
      videoEl,
      () => {
        attempt += 1
        return `http://localhost/stream?attempt=${attempt}`
      },
      {retries: 2, timeout: 1000},
    )

    await vi.runAllTimersAsync()
    await promise

    expect(videoEl.play).toHaveBeenCalledTimes(2)
    expect(videoEl.src).toBe('http://localhost/stream?attempt=2')
  })

  it('stops retrying when cancelled', async () => {
    const videoEl = {
      src: '',
      readyState: 4,
      error: {code: 2},
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      play: vi.fn().mockRejectedValue(new Error('network')),
      pause: vi.fn(),
      removeAttribute: vi.fn(),
      load: vi.fn(),
    } as unknown as HTMLVideoElement

    let cancelled = false
    const promise = playLiveStreamWhenReady(
      videoEl,
      () => 'http://localhost/stream',
      {
        retries: 4,
        timeout: 1000,
        isCancelled: () => cancelled,
      },
    )

    cancelled = true
    await vi.runAllTimersAsync()
    await promise

    expect(videoEl.play).toHaveBeenCalledTimes(1)
  })
})

describe('playWhenReady', () => {
  it('plays immediately when media is already buffered', async () => {
    const videoEl = {
      readyState: 4,
      play: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLVideoElement

    await playWhenReady(videoEl)
    expect(videoEl.play).toHaveBeenCalledTimes(1)
  })
})

describe('shouldAttemptDirectPlaybackFallback', () => {
  it('falls back on decode / src-not-supported when transcoding is enabled', () => {
    expect(shouldAttemptDirectPlaybackFallback({
      usesLiveTranscode: false,
      fallbackAttempted: false,
      transcodeEnabled: true,
      mediaErrorCode: 3,
    })).toBe(true)
    expect(shouldAttemptDirectPlaybackFallback({
      usesLiveTranscode: false,
      fallbackAttempted: false,
      transcodeEnabled: true,
      mediaErrorCode: 4,
    })).toBe(true)
  })

  it('does not fall back when already live, already tried, or transcoding is off', () => {
    expect(shouldAttemptDirectPlaybackFallback({
      usesLiveTranscode: true,
      fallbackAttempted: false,
      transcodeEnabled: true,
      mediaErrorCode: 3,
    })).toBe(false)
    expect(shouldAttemptDirectPlaybackFallback({
      usesLiveTranscode: false,
      fallbackAttempted: true,
      transcodeEnabled: true,
      mediaErrorCode: 3,
    })).toBe(false)
    expect(shouldAttemptDirectPlaybackFallback({
      usesLiveTranscode: false,
      fallbackAttempted: false,
      transcodeEnabled: false,
      mediaErrorCode: 3,
    })).toBe(false)
  })

  it('ignores abort / network media errors', () => {
    expect(shouldAttemptDirectPlaybackFallback({
      usesLiveTranscode: false,
      fallbackAttempted: false,
      transcodeEnabled: true,
      mediaErrorCode: 1,
    })).toBe(false)
    expect(shouldAttemptDirectPlaybackFallback({
      usesLiveTranscode: false,
      fallbackAttempted: false,
      transcodeEnabled: true,
      mediaErrorCode: 2,
    })).toBe(false)
  })
})
