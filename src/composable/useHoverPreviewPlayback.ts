import {computed, nextTick, ref, toValue, type MaybeRefOrGetter} from 'vue'
import {buildApiUrl} from '@/services/apiClient'
import {
  buildLiveStreamUrl,
  buildVideoStreamUrl,
  fetchPlayableInfo,
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
  shouldScheduleHoverPreviewVideo,
  resolveHoverPreviewScheduleDelay,
  resolveFixedPreviewClipState,
  resolveHoverLiveMaxHeight,
  resolveHoverPreviewSourcePlan,
  shouldComputeHoverPreviewPointerTime,
  shouldRestartFixedPreviewClip,
  HOVER_PREVIEW_LEAVE_NETWORK_ABORT_MS,
  waitForPreviewPresentedFrame,
  type HoverPreviewTeardownKind,
} from '@/utils/hoverPreviewPlayback'
import {positionHoverPreviewVideo} from '@/utils/hoverPreviewVideoPositioning'
import {LIVE_STREAM_CHUNK_SECONDS} from '@/utils/liveStreamChunk'
import {abortVideoPlayback} from '@/utils/liveTranscodeLifecycle'
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
  /**
   * True after the scrub frame is on screen (and during leave crossfade).
   * False only while loading/seeking — drives is-hover-preview-pending.
   */
  const hoverPreviewFrameVisible = ref(false)
  const previewUsesLiveStream = ref(false)

  let previewPlaybackToken = 0
  let previewDelayTimeout: ReturnType<typeof setTimeout> | undefined
  let leaveNetworkAbortTimeout: ReturnType<typeof setTimeout> | undefined
  let leaveNetworkAbortGen = 0
  /** One live FFmpeg attempt after direct hover fails. */
  let previewLiveFallbackAttempted = false
  let preferLivePreview = false
  /** Ignore src-change errors while handing off direct → live. */
  let ignoreVideoErrorsUntil = 0
  /** null = /playable still in flight for this hover. */
  let hoverPlayableSafe: boolean | null = null
  let hoverPlayablePromise: Promise<void> | null = null
  let hoverPlayableToken = 0

  const isHoverTranscodeEnabled = () => settingsStore.transcodeUnsupportedFormats === '1'

  const hoverLiveMaxHeight = () => resolveHoverLiveMaxHeight(settingsStore.transcodeMaxHeight)

  const armIgnoreVideoErrors = (ms = 750) => {
    ignoreVideoErrorsUntil = Date.now() + ms
  }

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
    hoverPreviewFrameVisible.value = true
    hoverPreviewReady.value = true
    options.onHoverPreviewReady()
  }

  const clearPreviewDelayTimer = () => {
    clearTimeout(previewDelayTimeout)
    previewDelayTimeout = undefined
  }

  const clearLeaveNetworkAbort = () => {
    leaveNetworkAbortGen += 1
    clearTimeout(leaveNetworkAbortTimeout)
    leaveNetworkAbortTimeout = undefined
  }

  const stopPreviewLiveTranscode = () => {
    if (!previewUsesLiveStream.value) return
    previewUsesLiveStream.value = false
    stopLiveTranscode(toValue(options.mediaId)).catch(() => {})
  }

  const resetPreviewLiveFallbackState = () => {
    previewLiveFallbackAttempted = false
    preferLivePreview = false
    ignoreVideoErrorsUntil = 0
    hoverPlayableSafe = null
    hoverPlayablePromise = null
    hoverPlayableToken += 1
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
    // Hot path: source=direct skips server ffprobe in resolveStreamPath.
    // /playable stays lazy (only on direct failure → live / unavailable).
    return Promise.resolve(buildVideoStreamUrl(
      buildApiUrl,
      toValue(options.mediaId),
      'direct',
      {bustCache: false},
    ))
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
    // Detached elements from a failed handoff must not clear the thumb notice.
    if (!allowHoverVideoElement.value || videoRef.value == null) return
    if (Date.now() < ignoreVideoErrorsUntil) return
    playbackError.value = false
    syncPlaybackTimeFromVideo()
  }

  const tryHoverLiveFallback = (): boolean => {
    // Only remux/re-encode after we know the file is browser-codec-safe.
    if (hoverPlayableSafe !== true) return false
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
    armIgnoreVideoErrors()
    return true
  }

  // Assigned below; video @error may fire after startPreviewPlayback exists.
  let startPreviewPlayback = async () => {}

  const finishHoverPlaybackFailure = () => {
    if (tryHoverLiveFallback()) {
      allowHoverVideoElement.value = true
      playbackError.value = false
      void startPreviewPlayback()
      return
    }
    markPreviewUnavailable()
  }

  const recoverHoverPlaybackFailure = (playbackToken: number) => {
    if (hoverPlayableSafe === false) {
      markPreviewUnavailable()
      return
    }
    // Lazy /playable: only probe when direct playback already failed so the
    // first video bytes are not competing with ffprobe on the same volume.
    if (hoverPlayableSafe === null) {
      const gateToken = hoverPlayableToken
      void beginHoverPlayableGate(toValue(options.mediaId)).finally(() => {
        if (gateToken !== hoverPlayableToken || playbackToken !== previewPlaybackToken) return
        if (!toValue(options.isHovered) || hoverPreviewReady.value) return
        if (hoverPlayableSafe === false) {
          markPreviewUnavailable()
          return
        }
        finishHoverPlaybackFailure()
      })
      return
    }
    finishHoverPlaybackFailure()
  }

  const handleVideoError = () => {
    if (Date.now() < ignoreVideoErrorsUntil) return

    const video = videoRef.value
    // Empty mount / cleared src must not kill the hover session.
    if (!video?.currentSrc && !video?.getAttribute('src')) return

    recoverHoverPlaybackFailure(previewPlaybackToken)
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
      deferSeek = false,
    }: {allowLiveChunkSwitch?: boolean; deferSeek?: boolean} = {},
  ): Promise<boolean> => {
    const video = videoRef.value
    if (!video || !toValue(options.isPreviewVisible)) return false

    const token = previewPlaybackToken
    const result = await positionHoverPreviewVideo({
      video,
      mediaId: toValue(options.mediaId),
      targetTime,
      allowLiveChunkSwitch,
      deferSeek,
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
    // Capture before unmount — aborting src while <video> is still painted under a
    // fading thumb flashes the gray card background (reads as white).
    const videoToAbort = plan.abortVideo ? videoRef.value : null
    if (plan.clearAllowHoverVideo) {
      hoverPreviewFrameVisible.value = false
      allowHoverVideoElement.value = false
    }
    if (plan.clearSeekCoalescer) hoverSeekCoalescer.clear()
    if (plan.clearDelayTimer) clearPreviewDelayTimer()
    if (plan.stopLive) {
      stopPreviewLiveTranscode()
      resetPreviewLiveFallbackState()
    }
    if (plan.releaseSession) releaseHoverVideoPreview(toValue(options.mediaId))
    if (videoToAbort) {
      // Yield to another card: abort immediately so the next Range request is
      // not queued behind the previous NAS read. Other teardowns defer abort
      // one tick to avoid a gray flash under a still-fading thumb.
      if (plan.clearAllowHoverVideo && kind !== 'yield-decoder') {
        void nextTick(() => abortVideoPlayback(videoToAbort))
      } else {
        abortVideoPlayback(videoToAbort)
      }
    }
  }

  const yieldHoverVideoDecoder = () => {
    applyHoverTeardown('yield-decoder')
  }

  const markPreviewUnavailable = () => {
    applyHoverTeardown('unavailable')
  }

  const beginHoverPlayableGate = (mediaId: number) => {
    if (hoverPlayablePromise) return hoverPlayablePromise
    const token = hoverPlayableToken
    hoverPlayableSafe = null
    hoverPlayablePromise = fetchPlayableInfo(mediaId)
      .then((playable) => {
        if (token !== hoverPlayableToken || !toValue(options.isHovered)) return
        const playability = playable.playability as {
          playable?: boolean
          needsRemux?: boolean
        } | undefined
        const plan = resolveHoverPreviewSourcePlan({
          mode: playable.mode,
          transcodeRequired: playable.transcodeRequired,
          streamPlayback: playable.streamPlayback,
          reason: playable.reason,
          playability,
          transcodeEnabled: isHoverTranscodeEnabled(),
        })
        if (plan.kind === 'unavailable') {
          hoverPlayableSafe = false
          markPreviewUnavailable()
          return
        }
        hoverPlayableSafe = true
      })
      .catch(() => {
        if (token !== hoverPlayableToken) return
        // Probe failed — keep optimistic direct playback.
        hoverPlayableSafe = true
      })
    return hoverPlayablePromise
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
    // Hide <video> until the scrub frame is presented (not during leave).
    hoverPreviewFrameVisible.value = false

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
      // Seek to scrub target before revealing — thumb stays opaque until ready,
      // so the t≈0 keyframe never flashes under the pointer position.
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
        if (token === previewPlaybackToken) recoverHoverPlaybackFailure(token)
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

      // One presented frame after play — cheap when #t=/seek already landed.
      await waitForPreviewPresentedFrame(video, isPreviewCancelled(token))
      if (token !== previewPlaybackToken) {
        releaseHoverVideoPreview(mediaId)
        return
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

      console.error('Video playback error:', error)
      if (token === previewPlaybackToken) recoverHoverPlaybackFailure(token)
    }
  }

  const schedulePreviewPlayback = () => {
    clearPreviewDelayTimer()
    if (!isAppWindowFocused()) return
    if (settingsStore.videoPreviewHover !== 'video' || !toValue(options.isFileExists)) return

    const startHoverVideo = async () => {
      if (!toValue(options.isHovered) || !isAppWindowFocused()) return

      clearLeaveNetworkAbort()
      const mediaId = toValue(options.mediaId)
      resetPreviewLiveFallbackState()

      const previewUrl = await buildPreviewVideoUrl(progress.value || 0)
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
    clearLeaveNetworkAbort()
    applyHoverTeardown('hide-immediate')
  }

  /** Video teardown half of stop / removeClasses. */
  const finalizePreviewStop = () => {
    clearLeaveNetworkAbort()
    applyHoverTeardown('finalize-stop')
  }

  /**
   * Soft mouseleave path: clear pending seeks/delay only.
   * Video element stays mounted for thumb crossfade / re-enter, but the Range
   * request is dropped after ~100ms (yesterday's leave timing) so the next
   * card is not stuck behind NAS reads.
   */
  const cancelHoverPlayback = () => {
    applyHoverTeardown('cancel-hover')
    clearLeaveNetworkAbort()
    const gen = leaveNetworkAbortGen
    const video = videoRef.value
    leaveNetworkAbortTimeout = setTimeout(() => {
      leaveNetworkAbortTimeout = undefined
      if (gen !== leaveNetworkAbortGen) return
      if (!allowHoverVideoElement.value) return
      // Drop the Range request without blanking to gray under the fading thumb.
      abortVideoPlayback(video, {preserveFrame: true})
    }, HOVER_PREVIEW_LEAVE_NETWORK_ABORT_MS)
  }

  /** Re-enter during leave grace: keep the still-loaded stream if present. */
  const preserveHoverPlaybackAfterLeave = () => {
    clearLeaveNetworkAbort()
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
    hoverPreviewPending: computed(
      () => allowHoverVideoElement.value && !hoverPreviewFrameVisible.value,
    ),
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
    preserveHoverPlaybackAfterLeave,
    clearPreviewDelayTimer,
    stopPreviewLiveTranscode,
    resetHoverPreviewReady,
    teardownWhenPreviewHidden,
    invalidateOnPlaybackError,
  }
}
