import {describe, it, expect, vi, beforeEach} from 'vitest'
import {
  buildLiveStreamUrl,
  buildVideoStreamUrl,
  invalidatePlayableInfo,
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

vi.mock('@/services/authSession', () => ({
  getAuthToken: vi.fn(() => null),
}))

import {typedApi} from '@/services/typedApi'
import {getAuthToken} from '@/services/authSession'

const mockGetVideoPlayable = vi.mocked(typedApi.getVideoPlayable)
const mockGetAuthToken = vi.mocked(getAuthToken)

describe('transcodeService urls', () => {
  const buildApiUrl = (path: string) => `http://localhost:12321${path}`

  beforeEach(() => {
    mockGetAuthToken.mockReturnValue(null)
  })

  it('builds live stream url with exact start offset', () => {
    const url = buildLiveStreamUrl(buildApiUrl, 42, 125.5)
    expect(url).toContain('/api/video/42/transcode/stream')
    expect(url).toContain('start=125.5')
  })

  it('builds live stream url with accurate seek flag for clip marks', () => {
    const url = buildLiveStreamUrl(buildApiUrl, 42, 641, '1080', {accurateSeek: true})
    expect(url).toContain('accurate=1')
    expect(url).toContain('start=641')
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

  it('appends auth token to video and live stream urls when present', () => {
    mockGetAuthToken.mockReturnValue('session-token')
    expect(buildVideoStreamUrl(buildApiUrl, 7, 'auto', {bustCache: false}))
      .toContain('token=session-token')
    expect(buildLiveStreamUrl(buildApiUrl, 42, 0))
      .toContain('token=session-token')
  })
})

describe('resolvePreviewVideoUrl', () => {
  const buildApiUrl = (path: string) => `http://localhost:12321${path}`

  beforeEach(() => {
    vi.clearAllMocks()
    invalidatePlayableInfo()
  })

  it('returns null for hard-incompat codecs so the thumb shows unavailable', async () => {
    mockGetVideoPlayable.mockResolvedValue({
      data: {
        transcodeRequired: true,
        mode: 'stream',
        streamPlayback: true,
        reason: 'video_codec',
        playability: {playable: false, videoCodec: 'hevc'},
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as never,
    })

    expect(await resolvePreviewVideoUrl(buildApiUrl, 15, 30, {transcodeEnabled: true})).toBeNull()
    expect(await resolvePreviewVideoUrl(buildApiUrl, 16, 30, {transcodeEnabled: false})).toBeNull()
  })

  it('returns direct url for container_layout hover (direct-first)', async () => {
    mockGetVideoPlayable.mockResolvedValue({
      data: {
        transcodeRequired: false,
        mode: 'direct',
        reason: 'container_layout',
        playability: {playable: true, needsRemux: true, videoCodec: 'h264', audioCodec: 'aac'},
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as never,
    })

    const url = await resolvePreviewVideoUrl(buildApiUrl, 15676, 810)
    expect(url).toContain('/api/video/15676?source=direct')
  })

  it('returns direct url for stale stream+container_layout playable responses', async () => {
    mockGetVideoPlayable.mockResolvedValue({
      data: {
        transcodeRequired: true,
        mode: 'stream',
        streamPlayback: true,
        reason: 'container_layout',
        playability: {playable: true, needsRemux: true, videoCodec: 'h264', audioCodec: 'aac'},
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as never,
    })

    const url = await resolvePreviewVideoUrl(buildApiUrl, 15676, 810)
    expect(url).toContain('/api/video/15676?source=direct')
  })

  it('returns direct stream url when format is browser-playable', async () => {
    mockGetVideoPlayable.mockResolvedValue({
      data: {transcodeRequired: false, mode: 'direct', streamPlayback: false},
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as never,
    })

    const url = await resolvePreviewVideoUrl(buildApiUrl, 15, 30)
    expect(url).toContain('/api/video/15?source=direct')
  })

  it('optimistic hover url skips playable lookup', async () => {
    const url = await resolvePreviewVideoUrl(buildApiUrl, 99, 0, {optimistic: true})
    expect(url).toContain('/api/video/99?source=direct')
    expect(mockGetVideoPlayable).not.toHaveBeenCalled()
  })

  it('reuses cached playable info for subsequent lookups', async () => {
    mockGetVideoPlayable.mockResolvedValue({
      data: {transcodeRequired: false, mode: 'direct', streamPlayback: false},
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as never,
    })

    await resolvePreviewVideoUrl(buildApiUrl, 21)
    await resolvePreviewVideoUrl(buildApiUrl, 21)

    expect(mockGetVideoPlayable).toHaveBeenCalledTimes(1)
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
