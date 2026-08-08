import {describe, it, expect, beforeEach, vi} from 'vitest'
import {
  armHoverPreviewCooldown,
  canMarkHoverPreviewReady,
  clampLiveChunkSeek,
  decideInPlacePreviewSeek,
  getHoverPreviewCooldownRemaining,
  getLoadedPreviewMediaId,
  getPreviewStreamStart,
  isIgnorablePreviewError,
  pointerRatioToPreviewTime,
  resetHoverPreviewCooldownForTests,
  resolveAbsolutePreviewTime,
  resolveHoverPreviewTargetTime,
  resolveLivePreviewRelativeTime,
  planPreviewUrlSeek,
  resolveHoverScrubProgressUpdate,
  resolvePreviewUrlStartSeconds,
  shouldComputeHoverPreviewPointerTime,
  resolveHoverPreviewTeardownPlan,
  resolveHoverPreviewStartGate,
  resolveHoverPreviewUrlReadyGate,
  resolveHoverPreviewAfterMountGate,
  resolveHoverPreviewAfterPositionGate,
  resolveHoverPreviewPlaybackErrorGate,
  resolveHoverPreviewSourcePlan,
  resolveHoverLiveMaxHeight,
  HOVER_PREVIEW_DIRECT_CANPLAY_MS,
  HOVER_PREVIEW_LIVE_MAX_HEIGHT,
  shouldAttemptHoverLiveFallback,
  shouldReloadLivePreviewSrc,
  shouldRestartFixedPreviewClip,
  shouldScheduleHoverPreviewVideo,
  resolveHoverPreviewScheduleDelay,
  resolveFixedPreviewClipState,
  createHoverSeekCoalescer,
  waitForPreviewSeek,
  waitForPreviewCanPlay,
  seekPreviewVideo,
} from './hoverPreviewPlayback'

describe('hoverPreviewPlayback', () => {
  beforeEach(() => {
    resetHoverPreviewCooldownForTests()
  })

  it('tracks cooldown after arming', () => {
    vi.useFakeTimers()
    armHoverPreviewCooldown(500)
    expect(getHoverPreviewCooldownRemaining()).toBe(500)
    vi.advanceTimersByTime(200)
    expect(getHoverPreviewCooldownRemaining()).toBe(300)
    vi.useRealTimers()
  })

  it('detects ignorable preview errors', () => {
    expect(isIgnorablePreviewError({name: 'AbortError'})).toBe(true)
    expect(isIgnorablePreviewError({name: 'NotAllowedError'})).toBe(true)
    expect(isIgnorablePreviewError({name: 'NotSupportedError'})).toBe(false)
  })

  it('decides in-place seeks for direct and live sources', () => {
    expect(decideInPlacePreviewSeek({
      loadedMediaId: 1,
      mediaId: 1,
      activeSrc: 'http://x/api/video/1/file.mp4',
      targetTime: 12,
      allowLiveChunkSwitch: false,
      currentTime: 1,
      seeking: false,
      videoDuration: 100,
    })).toEqual({kind: 'seek', time: 12})

    expect(decideInPlacePreviewSeek({
      loadedMediaId: 1,
      mediaId: 1,
      activeSrc: 'http://x/api/video/1/transcode/stream?start=10',
      targetTime: 50,
      allowLiveChunkSwitch: true,
      currentTime: 1,
      seeking: false,
      videoDuration: 100,
    })).toEqual({kind: 'needs-reload'})

    expect(decideInPlacePreviewSeek({
      loadedMediaId: null,
      mediaId: 1,
      activeSrc: '',
      targetTime: 12,
      allowLiveChunkSwitch: false,
      currentTime: 0,
      seeking: false,
      videoDuration: 100,
    })).toEqual({kind: 'not-applicable'})
  })

  it('decides when live preview src must reload', () => {
    expect(shouldReloadLivePreviewSrc({
      loadedMediaId: 1,
      mediaId: 1,
      activeSrc: 'http://x/api/video/1/transcode/stream?start=10',
      nextUrl: 'http://x/api/video/1/transcode/stream?start=10',
    })).toBe(false)

    expect(shouldReloadLivePreviewSrc({
      loadedMediaId: 1,
      mediaId: 1,
      activeSrc: 'http://x/api/video/1/transcode/stream?start=10',
      nextUrl: 'http://x/api/video/1/transcode/stream?start=40',
    })).toBe(true)

    expect(shouldReloadLivePreviewSrc({
      loadedMediaId: 2,
      mediaId: 1,
      activeSrc: 'http://x/api/video/2/transcode/stream?start=10',
      nextUrl: 'http://x/api/video/1/transcode/stream?start=10',
    })).toBe(true)

    expect(resolveLivePreviewRelativeTime(15.5, 10)).toBe(5.5)
    expect(resolveLivePreviewRelativeTime(8, 10)).toBe(0)
  })

  it('plans live and file preview seeks after a url is known', () => {
    expect(planPreviewUrlSeek({
      url: 'http://x/api/video/1/transcode/stream?start=10',
      loadedMediaId: 1,
      mediaId: 1,
      activeSrc: 'http://x/api/video/1/transcode/stream?start=10',
      targetTime: 15,
      videoDuration: 100,
    })).toEqual({
      kind: 'live',
      reload: false,
      streamStart: 10,
      relative: 5,
    })

    expect(planPreviewUrlSeek({
      url: 'http://x/api/video/1/file.mp4',
      loadedMediaId: null,
      mediaId: 1,
      activeSrc: '',
      targetTime: 12,
      videoDuration: 100,
    })).toEqual({
      kind: 'file',
      reload: true,
      nextTime: 12,
    })
  })

  it('gates pointer scrubbing and progress updates', () => {
    expect(shouldComputeHoverPreviewPointerTime({
      hasFixedPreviewTime: false,
      isFileExists: true,
      playbackError: false,
      videoPreviewHover: 'video',
      mediaDuration: 10,
    })).toBe(true)
    expect(shouldComputeHoverPreviewPointerTime({
      hasFixedPreviewTime: true,
      isFileExists: true,
      playbackError: false,
      videoPreviewHover: 'video',
      mediaDuration: 10,
    })).toBe(false)

    expect(resolveHoverScrubProgressUpdate({
      progressValue: 5,
      currentProgress: 5,
      showPlaybackTimeline: false,
    })).toBeNull()
    expect(resolveHoverScrubProgressUpdate({
      progressValue: 6,
      currentProgress: 5,
      showPlaybackTimeline: false,
    })).toEqual({progress: 6, playbackTime: 6})
    expect(resolveHoverScrubProgressUpdate({
      progressValue: 6,
      currentProgress: 5,
      showPlaybackTimeline: true,
    })).toEqual({progress: 6})

    expect(resolvePreviewUrlStartSeconds(50, false, 30)).toBeCloseTo(29.9, 5)
    expect(resolvePreviewUrlStartSeconds(50, true, 30)).toBe(50)
  })

  it('plans hover teardown recipes without side effects', () => {
    expect(resolveHoverPreviewTeardownPlan('yield-decoder')).toMatchObject({
      bumpToken: true,
      releaseSession: false,
      abortVideo: true,
      clearSeekCoalescer: true,
    })
    expect(resolveHoverPreviewTeardownPlan('unavailable')).toMatchObject({
      setPlaybackError: true,
      releaseSession: true,
      bumpToken: false,
    })
    expect(resolveHoverPreviewTeardownPlan('finalize-stop')).toMatchObject({
      clearPlaybackError: true,
      zeroPlaybackTime: true,
      releaseSession: true,
    })
    expect(resolveHoverPreviewTeardownPlan('preview-hidden')).toMatchObject({
      bumpToken: false,
      releaseSession: true,
      clearAllowHoverVideo: false,
    })
    expect(resolveHoverPreviewTeardownPlan('playback-error')).toMatchObject({
      bumpToken: true,
      releaseSession: false,
      clearDelayTimer: true,
    })
    expect(resolveHoverPreviewTeardownPlan('cancel-hover')).toMatchObject({
      bumpToken: false,
      resetReady: true,
      stopLive: false,
      abortVideo: false,
      clearAllowHoverVideo: false,
      releaseSession: false,
      clearSeekCoalescer: true,
      clearDelayTimer: true,
    })
  })

  it('gates hover start, mount, position, and playback errors', () => {
    expect(shouldScheduleHoverPreviewVideo({
      isHovered: true,
      isFocused: true,
      videoPreviewHover: 'video',
    })).toBe(true)
    expect(shouldScheduleHoverPreviewVideo({
      isHovered: true,
      isFocused: true,
      videoPreviewHover: 'image',
    })).toBe(false)

    expect(resolveHoverPreviewStartGate({
      hasVideo: false,
      isPreviewVisible: true,
      isFocused: true,
      tokenMatches: true,
      isHovered: true,
      playerBlocksLive: false,
    })).toBe('unavailable')
    expect(resolveHoverPreviewStartGate({
      hasVideo: true,
      isPreviewVisible: true,
      isFocused: true,
      tokenMatches: true,
      isHovered: true,
      playerBlocksLive: true,
    })).toBe('abort')
    expect(resolveHoverPreviewStartGate({
      hasVideo: true,
      isPreviewVisible: true,
      isFocused: true,
      tokenMatches: true,
      isHovered: true,
      playerBlocksLive: false,
    })).toBe('proceed')

    expect(resolveHoverPreviewUrlReadyGate({
      isHovered: true,
      isFocused: true,
      hasPreviewUrl: false,
    })).toBe('unavailable')
    expect(resolveHoverPreviewAfterMountGate({
      isHovered: false,
      isFocused: true,
      allowHoverVideo: true,
      hasVideoEl: true,
    })).toBe('teardown-stale')
    expect(resolveHoverPreviewAfterMountGate({
      isHovered: true,
      isFocused: true,
      allowHoverVideo: true,
      hasVideoEl: true,
    })).toBe('start')

    expect(resolveHoverPreviewAfterPositionGate({
      positioned: false,
      tokenMatches: true,
      isPreviewVisible: true,
      isFocused: true,
    })).toBe('unavailable')
    expect(resolveHoverPreviewAfterPositionGate({
      positioned: true,
      tokenMatches: true,
      isPreviewVisible: false,
      isFocused: true,
    })).toBe('release')
    expect(resolveHoverPreviewAfterPositionGate({
      positioned: true,
      tokenMatches: true,
      isPreviewVisible: true,
      isFocused: true,
    })).toBe('play')

    expect(resolveHoverPreviewPlaybackErrorGate({
      tokenMatches: true,
      ignorable: true,
    })).toBe('release')
    expect(resolveHoverPreviewPlaybackErrorGate({
      tokenMatches: true,
      ignorable: false,
    })).toBe('unavailable')
  })

  it('gates hover-ready marking', () => {
    expect(canMarkHoverPreviewReady({
      isHovered: true,
      isPreviewVisible: true,
      isBigPreviewVisual: false,
    })).toBe(true)
    expect(canMarkHoverPreviewReady({
      isHovered: true,
      isPreviewVisible: true,
      isBigPreviewVisual: true,
    })).toBe(false)
  })

  it('restarts fixed preview clips past the end time', () => {
    expect(shouldRestartFixedPreviewClip({
      previewStartTime: 1,
      previewEndTime: 5,
      playbackTime: 5.1,
    })).toBe(true)
    expect(shouldRestartFixedPreviewClip({
      previewStartTime: 1,
      previewEndTime: 5,
      playbackTime: 4,
    })).toBe(false)
  })

  it('resolves hover preview target time', () => {
    expect(resolveHoverPreviewTargetTime({
      hasFixedPreviewTime: true,
      previewStartTime: 12,
      progress: 3,
    })).toBe(12)
    expect(resolveHoverPreviewTargetTime({
      hasFixedPreviewTime: false,
      previewStartTime: 12,
      progress: 3,
    })).toBe(3)
  })

  it('reads stream start from url', () => {
    expect(getPreviewStreamStart('http://localhost/api/video/1/transcode/stream?start=12.5')).toBe('12.5')
    expect(getPreviewStreamStart('not a url')).toBeNull()
  })

  it('parses loaded media id from currentSrc only', () => {
    expect(getLoadedPreviewMediaId({currentSrc: 'http://x/api/video/42/transcode/stream?start=0'})).toBe(42)
    expect(getLoadedPreviewMediaId({currentSrc: 'http://localhost:3000/'}, 'http://localhost:3000/')).toBeNull()
    expect(getLoadedPreviewMediaId({currentSrc: ''})).toBeNull()
  })

  it('maps pointer ratio to preview time', () => {
    expect(pointerRatioToPreviewTime(50, {left: 0, width: 100}, 200)).toBe(100)
    expect(pointerRatioToPreviewTime(0, {left: 0, width: 100}, 200)).toBe(0)
    expect(pointerRatioToPreviewTime(10, {left: 0, width: 0}, 200)).toBeNull()
  })

  it('resolves absolute playhead for live streams', () => {
    expect(resolveAbsolutePreviewTime(3, {
      live: true,
      streamUrl: 'http://x/stream?start=10',
    })).toBe(13)
    expect(resolveAbsolutePreviewTime(3, {live: false})).toBe(3)
  })

  it('clamps seeks inside the live chunk', () => {
    const inside = clampLiveChunkSeek(15, 10, 30)
    expect(inside.withinCurrentSegment).toBe(true)
    expect(inside.relativeTime).toBe(5)

    const outside = clampLiveChunkSeek(50, 10, 30)
    expect(outside.withinCurrentSegment).toBe(false)
    expect(outside.clampedAbsolute).toBeCloseTo(39.95, 2)
  })

  it('waitForPreviewSeek resolves immediately when not seeking', async () => {
    const video = {seeking: false, addEventListener: vi.fn(), removeEventListener: vi.fn()} as unknown as HTMLVideoElement
    await expect(waitForPreviewSeek(video, () => false)).resolves.toBeUndefined()
  })

  it('seekPreviewVideo waits for seeked even when seeking flips async', async () => {
    let seeking = false
    let current = 0
    const listeners = new Map<string, Set<() => void>>()
    const video = {
      get currentTime() {
        return current
      },
      set currentTime(value: number) {
        // Keep showing the old frame until seeked (matches Chromium race).
        queueMicrotask(() => {
          seeking = true
          queueMicrotask(() => {
            current = value
            seeking = false
            listeners.get('seeked')?.forEach((handler) => handler())
          })
        })
      },
      get seeking() {
        return seeking
      },
      addEventListener: (type: string, handler: () => void) => {
        if (!listeners.has(type)) listeners.set(type, new Set())
        listeners.get(type)!.add(handler)
      },
      removeEventListener: (type: string, handler: () => void) => {
        listeners.get(type)?.delete(handler)
      },
    } as unknown as HTMLVideoElement

    const done = seekPreviewVideo(video, 12, () => false)
    await Promise.resolve()
    expect(listeners.get('seeked')?.size).toBe(1)
    expect(current).toBe(0)
    await done
    expect(current).toBe(12)
  })

  it('waitForPreviewCanPlay resolves when a current frame is ready', async () => {
    const video = {
      readyState: HTMLMediaElement.HAVE_CURRENT_DATA,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLVideoElement
    await expect(waitForPreviewCanPlay(video, () => false)).resolves.toBeUndefined()
  })

  it('caps live hover encode height for faster card previews', () => {
    expect(resolveHoverLiveMaxHeight(1080)).toBe(String(HOVER_PREVIEW_LIVE_MAX_HEIGHT))
    expect(resolveHoverLiveMaxHeight(240)).toBe('240')
    expect(resolveHoverLiveMaxHeight('0')).toBe(String(HOVER_PREVIEW_LIVE_MAX_HEIGHT))
    expect(HOVER_PREVIEW_DIRECT_CANPLAY_MS).toBe(8_000)
  })

  it('coalesces seek flushes while in flight', async () => {
    const sync = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5))
    })
    const coalescer = createHoverSeekCoalescer({
      resolveTime: (x) => x,
      sync,
      delayMs: 1,
    })

    coalescer.flush(1)
    coalescer.flush(2)
    coalescer.flush(3)
    await new Promise((r) => setTimeout(r, 30))
    expect(sync.mock.calls.map((call) => call[0])).toEqual([1, 3])
  })

  it('clamps hover preview schedule delay', () => {
    expect(resolveHoverPreviewScheduleDelay(-5)).toBe(0)
    expect(resolveHoverPreviewScheduleDelay('250')).toBe(250)
    expect(resolveHoverPreviewScheduleDelay(undefined)).toBe(0)
  })

  it('resolves fixed preview clip state', () => {
    expect(resolveFixedPreviewClipState(null)).toBeNull()
    expect(resolveFixedPreviewClipState(12.5)).toEqual({
      progress: 12.5,
      playbackTime: 12.5,
    })
  })

  it('plans hover preview source: direct first, notice for hard incompat', () => {
    expect(resolveHoverPreviewSourcePlan({
      mode: 'direct',
      reason: 'container_layout',
      playability: {playable: true, needsRemux: true},
      transcodeEnabled: true,
    })).toEqual({kind: 'direct', streamMode: 'auto'})

    expect(resolveHoverPreviewSourcePlan({
      mode: 'stream',
      transcodeRequired: true,
      streamPlayback: true,
      reason: 'container_layout',
      playability: {playable: true, needsRemux: true},
      transcodeEnabled: true,
    })).toEqual({kind: 'direct', streamMode: 'direct'})

    expect(resolveHoverPreviewSourcePlan({
      mode: 'stream',
      transcodeRequired: true,
      streamPlayback: true,
      reason: 'video_codec',
      playability: {playable: false},
      transcodeEnabled: true,
    })).toEqual({kind: 'unavailable'})

    expect(resolveHoverPreviewSourcePlan({
      mode: 'stream',
      transcodeRequired: true,
      reason: 'video_codec',
      playability: {playable: false},
      transcodeEnabled: false,
    })).toEqual({kind: 'unavailable'})

    expect(resolveHoverPreviewSourcePlan({
      mode: 'unsupported',
      transcodeEnabled: true,
    })).toEqual({kind: 'unavailable'})
  })

  it('allows one hover live fallback after direct fails', () => {
    expect(shouldAttemptHoverLiveFallback({
      alreadyLive: false,
      fallbackAttempted: false,
      transcodeEnabled: true,
    })).toBe(true)
    expect(shouldAttemptHoverLiveFallback({
      alreadyLive: true,
      fallbackAttempted: false,
      transcodeEnabled: true,
    })).toBe(false)
    expect(shouldAttemptHoverLiveFallback({
      alreadyLive: false,
      fallbackAttempted: true,
      transcodeEnabled: true,
    })).toBe(false)
    expect(shouldAttemptHoverLiveFallback({
      alreadyLive: false,
      fallbackAttempted: false,
      transcodeEnabled: false,
    })).toBe(false)
  })
})
