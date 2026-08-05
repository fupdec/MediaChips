import {nextTick, ref, toValue, type MaybeRefOrGetter} from 'vue'
import {buildApiUrl} from '@/services/apiClient'
import {
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
  decideInPlacePreviewSeek,
  getLoadedPreviewMediaId,
  getPreviewStreamStart,
  isIgnorablePreviewError,
  pointerRatioToPreviewTime,
  resolveAbsolutePreviewTime,
  resolveHoverPreviewTargetTime,
  shouldApplyPreviewSeek,
  shouldRestartFixedPreviewClip,
  waitForPreviewCanPlay,
  waitForPreviewSeek,
} from '@/utils/hoverPreviewPlayback'
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
  const previewUsesLiveStream = ref(false)

  let previewPlaybackToken = 0
  let previewDelayTimeout: ReturnType<typeof setTimeout> | undefined

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

  const buildPreviewVideoUrl = (startSeconds = progress.value || 0) =>
    resolvePreviewVideoUrl(buildApiUrl, toValue(options.mediaId), startSeconds)

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

  const handleVideoError = () => {
    playbackError.value = true
    allowHoverVideoElement.value = false
    resetHoverPreviewReady()
    abortVideoPlayback(videoRef.value)
    releaseHoverVideoPreview(toValue(options.mediaId))
  }

  const handleVideoLoaded = () => {
    playbackError.value = false
    syncPlaybackTimeFromVideo()
  }

  const getPreviewTimeFromPointer = (clientX: number): number | null => {
    if (toValue(options.hasFixedPreviewTime)) return null
    if (!toValue(options.isFileExists) || playbackError.value) return null
    if (settingsStore.videoPreviewHover !== 'video') return null

    const duration = toValue(options.mediaDuration)
    if (!duration) return null

    const preview = options.getPreviewEl()
    if (!preview) return null

    return pointerRatioToPreviewTime(
      clientX,
      preview.getBoundingClientRect(),
      duration,
    )
  }

  const applyPreviewTimeFromPointer = (
    e: Pick<MouseEvent, 'clientX'>,
    {seek = false}: {seek?: boolean} = {},
  ) => {
    const progressValue = getPreviewTimeFromPointer(e.clientX)
    if (progressValue == null) return

    if (progress.value !== progressValue) {
      progress.value = progressValue
      // Keep the playback timeline on the real video playhead; pointer only
      // drives hover scrubbing (`progress`) and deferred seeks.
      if (!toValue(options.showPlaybackTimeline)) {
        playbackTime.value = progressValue
      }
    }

    if (seek) {
      hoverSeekCoalescer.flush(progressValue)
    }
  }

  const isPreviewCancelled = (token: number) => () => token !== previewPlaybackToken

  const syncPreviewVideoPosition = async (
    targetTime: number,
    {allowLiveChunkSwitch = false}: {allowLiveChunkSwitch?: boolean} = {},
  ): Promise<boolean> => {
    const video = videoRef.value
    if (!video || !toValue(options.isPreviewVisible)) return false

    const mediaId = toValue(options.mediaId)
    const loadedMediaId = getLoadedPreviewMediaId(video)
    const activeSrc = video.currentSrc || ''

    // Prefer cheap in-place seeks. Reassigning src (esp. live chunks) starts a
    // download/encode storm while scrubbing.
    const inPlace = decideInPlacePreviewSeek({
      loadedMediaId,
      mediaId,
      activeSrc,
      targetTime,
      allowLiveChunkSwitch,
      currentTime: video.currentTime,
      seeking: video.seeking,
      videoDuration: video.duration || 0,
    })
    if (inPlace.kind === 'busy') return true
    if (inPlace.kind === 'noop') {
      syncPlaybackTimeFromVideo()
      return true
    }
    if (inPlace.kind === 'seek') {
      video.currentTime = inPlace.time
      await waitForPreviewSeek(video, isPreviewCancelled(previewPlaybackToken))
      syncPlaybackTimeFromVideo()
      return true
    }
    if (inPlace.kind !== 'needs-reload' && inPlace.kind !== 'not-applicable') {
      return false
    }
    // needs-reload or not-applicable → fall through to src reload below.

    const token = previewPlaybackToken
    const url = await buildPreviewVideoUrl(
      allowLiveChunkSwitch
        ? targetTime
        : Math.min(targetTime, LIVE_STREAM_CHUNK_SECONDS - 0.1),
    )
    if (!url) return false
    if (token !== previewPlaybackToken) return false
    const isLive = url.includes('/transcode/stream')

    if (isLive) {
      previewUsesLiveStream.value = true
      const nextStart = getPreviewStreamStart(url)
      const currentStart = activeSrc.includes('/transcode/stream') && loadedMediaId === mediaId
        ? getPreviewStreamStart(activeSrc)
        : null

      if (loadedMediaId !== mediaId || currentStart !== nextStart) {
        video.src = url
        await waitForPreviewCanPlay(video, isPreviewCancelled(token), {live: true})
      }

      if (token !== previewPlaybackToken) return false
      const streamStart = Number(nextStart) || 0
      const relative = Math.max(0, targetTime - streamStart)
      if (shouldApplyPreviewSeek(video.currentTime, relative)) {
        video.currentTime = relative
        await waitForPreviewSeek(video, isPreviewCancelled(token))
        if (token !== previewPlaybackToken) return false
      }
      syncPlaybackTimeFromVideo()
      return true
    }

    previewUsesLiveStream.value = false
    if (loadedMediaId !== mediaId) {
      video.src = url
      await waitForPreviewCanPlay(video, isPreviewCancelled(token))
    }

    if (token !== previewPlaybackToken) return false
    const nextTime = Math.min(targetTime, video.duration || targetTime)
    if (shouldApplyPreviewSeek(video.currentTime, nextTime)) {
      video.currentTime = nextTime
      await waitForPreviewSeek(video, isPreviewCancelled(token))
      if (token !== previewPlaybackToken) return false
    }
    syncPlaybackTimeFromVideo()
    return true
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

  const yieldHoverVideoDecoder = () => {
    previewPlaybackToken += 1
    resetHoverPreviewReady()
    allowHoverVideoElement.value = false
    hoverSeekCoalescer.clear()
    clearPreviewDelayTimer()
    stopPreviewLiveTranscode()
    abortVideoPlayback(videoRef.value)
  }

  const markPreviewUnavailable = () => {
    playbackError.value = true
    allowHoverVideoElement.value = false
    resetHoverPreviewReady()
    stopPreviewLiveTranscode()
    abortVideoPlayback(videoRef.value)
    releaseHoverVideoPreview(toValue(options.mediaId))
  }

  const startPreviewPlayback = async () => {
    const token = ++previewPlaybackToken
    const video = videoRef.value
    if (!video || !toValue(options.isPreviewVisible) || !isAppWindowFocused()) {
      if (token === previewPlaybackToken && toValue(options.isHovered)) {
        markPreviewUnavailable()
      }
      return
    }
    if (playerStore.active && playerStore.liveTranscodeMediaId === toValue(options.mediaId)) return

    const mediaId = toValue(options.mediaId)
    claimHoverVideoPreview(mediaId, yieldHoverVideoDecoder)

    const previewStartTime = toValue(options.previewStartTime)
    const targetTime = resolveHoverPreviewTargetTime({
      hasFixedPreviewTime: toValue(options.hasFixedPreviewTime),
      previewStartTime,
      progress: progress.value,
    })

    if (toValue(options.hasFixedPreviewTime) && previewStartTime != null) {
      progress.value = previewStartTime
      playbackTime.value = previewStartTime
    }

    try {
      const positioned = await syncPreviewVideoPosition(targetTime, {
        allowLiveChunkSwitch: true,
      })
      if (!positioned) {
        if (token === previewPlaybackToken) {
          markPreviewUnavailable()
        }
        return
      }

      if (
        token !== previewPlaybackToken ||
        !toValue(options.isPreviewVisible) ||
        !isAppWindowFocused()
      ) {
        if (token === previewPlaybackToken) releaseHoverVideoPreview(mediaId)
        return
      }

      await video.play()
      playbackError.value = false
      syncPlaybackTimeFromVideo()
      markHoverPreviewReady()
    } catch (error) {
      if (token !== previewPlaybackToken || isIgnorablePreviewError(error)) {
        if (token === previewPlaybackToken) releaseHoverVideoPreview(mediaId)
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

      // Resolve before mounting — unsupported formats get the notice immediately.
      const previewUrl = await resolvePreviewVideoUrl(
        buildApiUrl,
        mediaId,
        progress.value || 0,
      )
      if (!toValue(options.isHovered) || !isAppWindowFocused()) return
      if (!previewUrl) {
        markPreviewUnavailable()
        return
      }

      // Claim before mounting so another card's decoder is torn down first.
      claimHoverVideoPreview(mediaId, yieldHoverVideoDecoder)
      allowHoverVideoElement.value = true
      await nextTick()

      if (
        !toValue(options.isHovered) ||
        !isAppWindowFocused() ||
        !allowHoverVideoElement.value
      ) {
        allowHoverVideoElement.value = false
        releaseHoverVideoPreview(mediaId)
        abortVideoPlayback(videoRef.value)
        return
      }

      if (!videoRef.value) {
        markPreviewUnavailable()
        return
      }

      void startPreviewPlayback()
    }

    const delay = Math.max(0, Number(settingsStore.delayVideoPreview) || 0)
    if (delay === 0) {
      void startHoverVideo()
      return
    }
    previewDelayTimeout = setTimeout(() => {
      void startHoverVideo()
    }, delay)
  }

  const scheduleHoverPreviewUi = () => {
    if (!toValue(options.isHovered) || !isAppWindowFocused()) return

    if (settingsStore.videoPreviewHover === 'video') {
      schedulePreviewPlayback()
    }
    // Big preview is armed from markHoverPreviewReady after hover video plays.
  }

  const applyFixedPreviewTime = () => {
    const previewStartTime = toValue(options.previewStartTime)
    if (previewStartTime == null) return

    progress.value = previewStartTime
    playbackTime.value = previewStartTime
  }

  const hidePreviewVideoImmediately = () => {
    previewPlaybackToken += 1
    resetHoverPreviewReady()
    allowHoverVideoElement.value = false
    stopPreviewLiveTranscode()
    releaseHoverVideoPreview(toValue(options.mediaId))
    abortVideoPlayback(videoRef.value)
  }

  /** Video teardown half of stop / removeClasses. */
  const finalizePreviewStop = () => {
    previewPlaybackToken += 1
    playbackError.value = false
    playbackTime.value = 0
    resetHoverPreviewReady()
    allowHoverVideoElement.value = false
    stopPreviewLiveTranscode()
    releaseHoverVideoPreview(toValue(options.mediaId))
    abortVideoPlayback(videoRef.value)
  }

  /**
   * Soft mouseleave path: bump token, clear seeks, unmount video, stop live,
   * release session. Caller still owns cinema / leave timers.
   */
  const cancelHoverPlayback = () => {
    previewPlaybackToken += 1
    resetHoverPreviewReady()
    allowHoverVideoElement.value = false
    hoverSeekCoalescer.clear()
    clearPreviewDelayTimer()
    stopPreviewLiveTranscode()
    releaseHoverVideoPreview(toValue(options.mediaId))
    abortVideoPlayback(videoRef.value)
  }

  /** Teardown when showVideoPreview becomes inactive. */
  const teardownWhenPreviewHidden = () => {
    resetHoverPreviewReady()
    stopPreviewLiveTranscode()
    releaseHoverVideoPreview(toValue(options.mediaId))
    abortVideoPlayback(videoRef.value)
  }

  /** Token bump + video teardown when playbackError flips true (SFC owns cinema / big preview). */
  const invalidateOnPlaybackError = () => {
    previewPlaybackToken += 1
    clearPreviewDelayTimer()
    allowHoverVideoElement.value = false
    resetHoverPreviewReady()
    stopPreviewLiveTranscode()
    abortVideoPlayback(videoRef.value)
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
