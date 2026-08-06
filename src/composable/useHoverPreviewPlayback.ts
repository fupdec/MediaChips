import {nextTick, ref, toValue, type MaybeRefOrGetter} from 'vue'
import {buildApiUrl} from '@/services/apiClient'
import {
  buildLiveStreamUrl,
  resolvePreviewVideoUrl,
  stopLiveTranscode,
} from '@/services/transcodeService'
import {usePlayerStore} from '@/stores/player'
import {useSettingsStore} from '@/stores/settings'
import {
  claimHoverVideoPreview,
  releaseHoverVideoPreview,
} from '@/utils/hoverPreviewSession'
import {
  canMarkHoverPreviewReady,
  createHoverSeekCoalescer,
  isIgnorablePreviewError,
  pointerRatioToPreviewTime,
  resolveAbsolutePreviewTime,
  resolveHoverPreviewTargetTime,
  resolveHoverScrubProgressUpdate,
  resolveHoverPreviewTeardownPlan,
  resolveHoverPreviewStartGate,
  resolveHoverPreviewUrlReadyGate,
  resolveHoverPreviewAfterMountGate,
  resolveHoverPreviewAfterPositionGate,
  resolveHoverPreviewPlaybackErrorGate,
  shouldAttemptHoverLiveFallback,
  shouldApplyPreviewSeek,
  seekPreviewVideo,
  shouldScheduleHoverPreviewVideo,
  resolveHoverPreviewScheduleDelay,
  resolveFixedPreviewClipState,
  shouldComputeHoverPreviewPointerTime,
  shouldRestartFixedPreviewClip,
  type HoverPreviewTeardownKind,
} from '@/utils/hoverPreviewPlayback'
import {positionHoverPreviewVideo} from '@/utils/hoverPreviewVideoPositioning'
import {LIVE_STREAM_CHUNK_SECONDS} from '@/utils/liveStreamChunk'
import {abortVideoPlayback} from '@/utils/liveTranscodeLifecycle'
import {normalizeTranscodeMaxHeight} from '@/utils/playerPlaybackResolve'
import {isAppWindowFocused} from '@/utils/windowFocus'

export type HoverPreviewPlaybackOptions = {
  mediaId: MaybeRefOrGetter<number>
  mediaDuration: MaybeRefOrGetter<number>
  isFileExists: MaybeRefOrGetter<boolean>
  previewStartTime: MaybeRefOrGetter<number | undefined>
  previewEndTime: MaybeRefOrGetter<number | null | undefined>
  hasFixedPreviewTime: MaybeRefOrGetter<boolean>
  isHovered: MaybeRefOrGetter<boolean>
  /** Getter for showVideoPreview — define after composable; TDZ-safe when called later. */
  isPreviewVisible: MaybeRefOrGetter<boolean>
  getPreviewEl: () => HTMLElement | null
  showPlaybackTimeline: MaybeRefOrGetter<boolean>
  isBigPreviewVisual: MaybeRefOrGetter<boolean>
  onHoverPreviewReady: () => void
}

export function useHoverPreviewPlayback(options: HoverPreviewPlaybackOptions) {
  const settingsStore = useSettingsStore()
  const playerStore = usePlayerStore()

  const videoRef = ref<HTMLVideoElement | null>(null)
  const progress = ref(0)
  const playbackTime = ref(0)
  const playbackError = ref(false)
  /** When false, <video> unmounts immediately (leave) without waiting for CSS hover grace. */
  const allowHoverVideoElement = ref(false)
  const hoverPreviewReady = ref(false)
  const previewUsesLiveStream = ref(false)

  let previewPlaybackToken = 0
  let previewDelayTimeout: ReturnType<typeof setTimeout> | undefined
  /** One live FFmpeg attempt after direct hover fails. */
  let previewLiveFallbackAttempted = false
  let preferLivePreview = false

  const isHoverTranscodeEnabled = () => settingsStore.transcodeUnsupportedFormats === '1'

  const hoverLiveMaxHeight = () => normalizeTranscodeMaxHeight(settingsStore.transcodeMaxHeight)

  const resetHoverPreviewReady = () => {
    hoverPreviewReady.value = false
  }

  const markHoverPreviewReady = () => {
    if (!canMarkHoverPreviewReady({
      isHovered: toValue(options.isHovered),
      isPreviewVisible: toValue(options.isPreviewVisible),
      isBigPreviewVisual: toValue(options.isBigPreviewVisual),
    })) {
      return
    }
    hoverPreviewReady.value = true
    options.onHoverPreviewReady()
  }

  const clearPreviewDelayTimer = () => {
    clearTimeout(previewDelayTimeout)
    previewDelayTimeout = undefined
  }

  const stopPreviewLiveTranscode = () => {
    if (!previewUsesLiveStream.value) return
    previewUsesLiveStream.value = false
    stopLiveTranscode(toValue(options.mediaId)).catch(() => {})
  }

  const resetPreviewLiveFallbackState = () => {
    previewLiveFallbackAttempted = false
    preferLivePreview = false
  }

  const buildPreviewVideoUrl = (startSeconds = progress.value || 0) => {
    if (preferLivePreview || previewUsesLiveStream.value) {
      return Promise.resolve(buildLiveStreamUrl(
        buildApiUrl,
        toValue(options.mediaId),
        startSeconds,
        hoverLiveMaxHeight(),
      ))
    }
    return resolvePreviewVideoUrl(
      buildApiUrl,
      toValue(options.mediaId),
      startSeconds,
      {
        transcodeEnabled: isHoverTranscodeEnabled(),
        maxHeight: hoverLiveMaxHeight(),
      },
    )
  }

  const resolvePreviewPlaybackTime = (): number => {
    const video = videoRef.value
    if (!video || !Number.isFinite(video.currentTime)) {
      return progress.value
    }

    return resolveAbsolutePreviewTime(video.currentTime, {
      live: previewUsesLiveStream.value,
      streamUrl: video.src || null,
    })
  }

  const syncPlaybackTimeFromVideo = () => {
    if (!toValue(options.isPreviewVisible)) return

    const total = toValue(options.mediaDuration)
    if (!total) return

    playbackTime.value = Math.min(Math.max(0, resolvePreviewPlaybackTime()), total)
  }

  const handleVideoLoaded = () => {
    playbackError.value = false
    syncPlaybackTimeFromVideo()
  }

  const tryHoverLiveFallback = (): boolean => {
    if (!shouldAttemptHoverLiveFallback({
      alreadyLive: previewUsesLiveStream.value || preferLivePreview,
      fallbackAttempted: previewLiveFallbackAttempted,
      transcodeEnabled: isHoverTranscodeEnabled(),
    })) {
      return false
    }
    previewLiveFallbackAttempted = true
    preferLivePreview = true
    previewUsesLiveStream.value = true
    return true
  }

  // Assigned below; video @error may fire after startPreviewPlayback exists.
  let startPreviewPlayback = async () => {}

  const handleVideoError = () => {
    if (tryHoverLiveFallback()) {
      void startPreviewPlayback()
      return
    }

    playbackError.value = true
    allowHoverVideoElement.value = false
    resetHoverPreviewReady()
    abortVideoPlayback(videoRef.value)
    releaseHoverVideoPreview(toValue(options.mediaId))
  }

  const getPreviewTimeFromPointer = (clientX: number): number | null => {
    if (!shouldComputeHoverPreviewPointerTime({
      hasFixedPreviewTime: toValue(options.hasFixedPreviewTime),
      isFileExists: toValue(options.isFileExists),
      playbackError: playbackError.value,
      videoPreviewHover: settingsStore.videoPreviewHover,
      mediaDuration: toValue(options.mediaDuration),
    })) return null

    const preview = options.getPreviewEl()
    if (!preview) return null

    return pointerRatioToPreviewTime(
      clientX,
      preview.getBoundingClientRect(),
      toValue(options.mediaDuration),
    )
  }

  const applyPreviewTimeFromPointer = (
    e: Pick<MouseEvent, 'clientX'>,
    {seek = false}: {seek?: boolean} = {},
  ) => {
    const progressValue = getPreviewTimeFromPointer(e.clientX)
    if (progressValue == null) return

    const update = resolveHoverScrubProgressUpdate({
      progressValue,
      currentProgress: progress.value,
      showPlaybackTimeline: toValue(options.showPlaybackTimeline),
    })
    if (update) {
      progress.value = update.progress
      if (update.playbackTime != null) {
        playbackTime.value = update.playbackTime
      }
    }

    if (seek) {
      hoverSeekCoalescer.flush(progressValue)
    }
  }

  const isPreviewCancelled = (token: number) => () => token !== previewPlaybackToken

  const syncPreviewVideoPosition = async (
    targetTime: number,
    {
      allowLiveChunkSwitch = false,
    }: {allowLiveChunkSwitch?: boolean} = {},
  ): Promise<boolean> => {
    const video = videoRef.value
    if (!video || !toValue(options.isPreviewVisible)) return false

    const token = previewPlaybackToken
    const result = await positionHoverPreviewVideo({
      video,
      mediaId: toValue(options.mediaId),
      targetTime,
      allowLiveChunkSwitch,
      isCancelled: isPreviewCancelled(token),
      resolveUrl: buildPreviewVideoUrl,
      chunkSeconds: LIVE_STREAM_CHUNK_SECONDS,
      setLiveMode: (live) => {
        previewUsesLiveStream.value = live
      },
      onPositioned: syncPlaybackTimeFromVideo,
    })

    return result === 'positioned'
  }

  let hoverSeekCoalescer = createHoverSeekCoalescer({
    resolveTime: (clientX) => getPreviewTimeFromPointer(clientX),
    sync: (targetTime) => syncPreviewVideoPosition(targetTime, {allowLiveChunkSwitch: false}),
    delayMs: 220,
  })

  const changePreviewTime = (e: MouseEvent) => {
    // Progress UI updates immediately; actual seeks are coalesced below.
    applyPreviewTimeFromPointer(e, {seek: false})
    hoverSeekCoalescer.schedule(e.clientX)
  }

  const handleVideoTimeUpdate = () => {
    const previewEndTime = toValue(options.previewEndTime)
    const previewStartTime = toValue(options.previewStartTime)
    if (shouldRestartFixedPreviewClip({
      previewStartTime,
      previewEndTime,
      playbackTime: resolvePreviewPlaybackTime(),
    }) && previewStartTime != null) {
      void syncPreviewVideoPosition(previewStartTime)
      return
    }

    syncPlaybackTimeFromVideo()
  }

  const applyHoverTeardown = (kind: HoverPreviewTeardownKind) => {
    const plan = resolveHoverPreviewTeardownPlan(kind)
    if (plan.bumpToken) previewPlaybackToken += 1
    if (plan.setPlaybackError) playbackError.value = true
    if (plan.clearPlaybackError) playbackError.value = false
    if (plan.zeroPlaybackTime) playbackTime.value = 0
    if (plan.resetReady) resetHoverPreviewReady()
    if (plan.clearAllowHoverVideo) allowHoverVideoElement.value = false
    if (plan.clearSeekCoalescer) hoverSeekCoalescer.clear()
    if (plan.clearDelayTimer) clearPreviewDelayTimer()
    if (plan.stopLive) {
      stopPreviewLiveTranscode()
      resetPreviewLiveFallbackState()
    }
    if (plan.releaseSession) releaseHoverVideoPreview(toValue(options.mediaId))
    if (plan.abortVideo) abortVideoPlayback(videoRef.value)
  }

  const yieldHoverVideoDecoder = () => {
    applyHoverTeardown('yield-decoder')
  }

  const markPreviewUnavailable = () => {
    applyHoverTeardown('unavailable')
  }

  startPreviewPlayback = async () => {
    const token = ++previewPlaybackToken
    const video = videoRef.value
    const startGate = resolveHoverPreviewStartGate({
      hasVideo: Boolean(video),
      isPreviewVisible: toValue(options.isPreviewVisible),
      isFocused: isAppWindowFocused(),
      tokenMatches: token === previewPlaybackToken,
      isHovered: toValue(options.isHovered),
      playerBlocksLive: Boolean(
        playerStore.active && playerStore.liveTranscodeMediaId === toValue(options.mediaId),
      ),
    })
    if (startGate === 'unavailable') {
      markPreviewUnavailable()
      return
    }
    if (startGate === 'abort' || !video) return

    const mediaId = toValue(options.mediaId)
    claimHoverVideoPreview(mediaId, yieldHoverVideoDecoder)

    const previewStartTime = toValue(options.previewStartTime)
    const targetTime = resolveHoverPreviewTargetTime({
      hasFixedPreviewTime: toValue(options.hasFixedPreviewTime),
      previewStartTime,
      progress: progress.value,
    })

    if (toValue(options.hasFixedPreviewTime)) {
      const clip = resolveFixedPreviewClipState(previewStartTime)
      if (clip) {
        progress.value = clip.progress
        playbackTime.value = clip.playbackTime
      }
    }

    try {
      const positioned = await syncPreviewVideoPosition(targetTime, {
        allowLiveChunkSwitch: true,
      })
      const afterPosition = resolveHoverPreviewAfterPositionGate({
        positioned,
        tokenMatches: token === previewPlaybackToken,
        isPreviewVisible: toValue(options.isPreviewVisible),
        isFocused: isAppWindowFocused(),
      })
      if (afterPosition === 'unavailable') {
        if (token === previewPlaybackToken && tryHoverLiveFallback()) {
          void startPreviewPlayback()
          return
        }
        markPreviewUnavailable()
        return
      }
      if (afterPosition === 'release') {
        releaseHoverVideoPreview(mediaId)
        return
      }
      if (afterPosition !== 'play') return

      await video.play()
      if (token !== previewPlaybackToken) {
        releaseHoverVideoPreview(mediaId)
        return
      }

      // Keep the thumb covering until we are actually on the target frame.
      if (
        video.seeking
        || shouldApplyPreviewSeek(video.currentTime, targetTime)
      ) {
        await seekPreviewVideo(video, targetTime, isPreviewCancelled(token))
        if (token !== previewPlaybackToken) {
          releaseHoverVideoPreview(mediaId)
          return
        }
      }

      playbackError.value = false
      syncPlaybackTimeFromVideo()
      markHoverPreviewReady()
    } catch (error) {
      const errorGate = resolveHoverPreviewPlaybackErrorGate({
        tokenMatches: token === previewPlaybackToken,
        ignorable: isIgnorablePreviewError(error),
      })
      if (errorGate === 'release') {
        if (token === previewPlaybackToken) releaseHoverVideoPreview(mediaId)
        return
      }

      if (token === previewPlaybackToken && tryHoverLiveFallback()) {
        void startPreviewPlayback()
        return
      }

      console.error('Video playback error:', error)
      markPreviewUnavailable()
    }
  }

  const schedulePreviewPlayback = () => {
    clearPreviewDelayTimer()
    if (!isAppWindowFocused()) return
    if (settingsStore.videoPreviewHover !== 'video' || !toValue(options.isFileExists)) return

    const startHoverVideo = async () => {
      if (!toValue(options.isHovered) || !isAppWindowFocused()) return

      const mediaId = toValue(options.mediaId)
      resetPreviewLiveFallbackState()

      // Resolve before mounting — unsupported formats get the notice immediately.
      // Codec-incompatible formats may resolve to a live URL when transcode is on.
      const previewUrl = await buildPreviewVideoUrl(progress.value || 0)
      if (previewUrl?.includes('/transcode/stream')) {
        preferLivePreview = true
        previewUsesLiveStream.value = true
      }
      const urlGate = resolveHoverPreviewUrlReadyGate({
        isHovered: toValue(options.isHovered),
        isFocused: isAppWindowFocused(),
        hasPreviewUrl: Boolean(previewUrl),
      })
      if (urlGate === 'abort') return
      if (urlGate === 'unavailable') {
        markPreviewUnavailable()
        return
      }

      // Claim before mounting so another card's decoder is torn down first.
      claimHoverVideoPreview(mediaId, yieldHoverVideoDecoder)
      allowHoverVideoElement.value = true
      await nextTick()

      const afterMount = resolveHoverPreviewAfterMountGate({
        isHovered: toValue(options.isHovered),
        isFocused: isAppWindowFocused(),
        allowHoverVideo: allowHoverVideoElement.value,
        hasVideoEl: Boolean(videoRef.value),
      })
      if (afterMount === 'teardown-stale') {
        allowHoverVideoElement.value = false
        releaseHoverVideoPreview(mediaId)
        abortVideoPlayback(videoRef.value)
        return
      }
      if (afterMount === 'unavailable') {
        markPreviewUnavailable()
        return
      }

      void startPreviewPlayback()
    }

    const delay = resolveHoverPreviewScheduleDelay(settingsStore.delayVideoPreview)
    if (delay === 0) {
      void startHoverVideo()
      return
    }
    previewDelayTimeout = setTimeout(() => {
      void startHoverVideo()
    }, delay)
  }

  const scheduleHoverPreviewUi = () => {
    if (!shouldScheduleHoverPreviewVideo({
      isHovered: toValue(options.isHovered),
      isFocused: isAppWindowFocused(),
      videoPreviewHover: settingsStore.videoPreviewHover,
    })) return

    schedulePreviewPlayback()
    // Big preview is armed from markHoverPreviewReady after hover video plays.
  }

  const applyFixedPreviewTime = () => {
    const clip = resolveFixedPreviewClipState(toValue(options.previewStartTime))
    if (!clip) return

    progress.value = clip.progress
    playbackTime.value = clip.playbackTime
  }

  const hidePreviewVideoImmediately = () => {
    applyHoverTeardown('hide-immediate')
  }

  /** Video teardown half of stop / removeClasses. */
  const finalizePreviewStop = () => {
    applyHoverTeardown('finalize-stop')
  }

  /**
   * Soft mouseleave path: clear pending seeks/delay only.
   * Video stays mounted until stopPlayingPreview / finalize-stop.
   */
  const cancelHoverPlayback = () => {
    applyHoverTeardown('cancel-hover')
  }

  /** Teardown when showVideoPreview becomes inactive. */
  const teardownWhenPreviewHidden = () => {
    applyHoverTeardown('preview-hidden')
  }

  /** Token bump + video teardown when playbackError flips true (SFC owns cinema / big preview). */
  const invalidateOnPlaybackError = () => {
    applyHoverTeardown('playback-error')
  }

  return {
    videoRef,
    progress,
    playbackTime,
    playbackError,
    allowHoverVideoElement,
    hoverPreviewReady,
    previewUsesLiveStream,
    changePreviewTime,
    handleVideoError,
    handleVideoLoaded,
    handleVideoTimeUpdate,
    applyPreviewTimeFromPointer,
    applyFixedPreviewTime,
    scheduleHoverPreviewUi,
    syncPreviewVideoPosition,
    hidePreviewVideoImmediately,
    finalizePreviewStop,
    cancelHoverPlayback,
    clearPreviewDelayTimer,
    stopPreviewLiveTranscode,
    resetHoverPreviewReady,
    teardownWhenPreviewHidden,
    invalidateOnPlaybackError,
  }
}
