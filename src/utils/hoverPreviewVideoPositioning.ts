import {
  decideInPlacePreviewSeek,
  getLoadedPreviewMediaId,
  planPreviewUrlSeek,
  resolvePreviewUrlStartSeconds,
  shouldApplyPreviewSeek,
  waitForPreviewCanPlay,
  waitForPreviewSeek,
  seekPreviewVideo,
  appendPreviewMediaFragment,
  PREVIEW_INITIAL_SEEK_WAIT_MS,
} from '@/utils/hoverPreviewPlayback'

export type HoverPreviewPositionResult = 'positioned' | 'cancelled' | 'unavailable'

/**
 * Seek or reload a hover preview <video> to the requested absolute media time.
 * Framework-free so seek/reload races can be unit-tested without Vue.
 */
export async function positionHoverPreviewVideo(input: {
  video: HTMLVideoElement
  mediaId: number
  targetTime: number
  allowLiveChunkSwitch?: boolean
  /** After src reload, return on first canplay without awaiting mid-file seek. */
  deferSeek?: boolean
  retriedBusy?: boolean
  isCancelled: () => boolean
  resolveUrl: (startSeconds: number) => Promise<string | null>
  chunkSeconds: number
  setLiveMode: (live: boolean) => void
  onPositioned: () => void
}): Promise<HoverPreviewPositionResult> {
  const {
    video,
    mediaId,
    targetTime,
    allowLiveChunkSwitch = false,
    deferSeek = false,
    retriedBusy = false,
    isCancelled,
    resolveUrl,
    chunkSeconds,
    setLiveMode,
    onPositioned,
  } = input

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

  if (inPlace.kind === 'busy') {
    await waitForPreviewSeek(video, isCancelled)
    if (isCancelled()) return 'cancelled'
    // Re-decide after the in-flight seek settles; never treat busy as positioned.
    if (retriedBusy) {
      onPositioned()
      return 'positioned'
    }
    return positionHoverPreviewVideo({
      ...input,
      retriedBusy: true,
    })
  }

  if (inPlace.kind === 'noop') {
    onPositioned()
    return 'positioned'
  }

  if (inPlace.kind === 'seek') {
    await seekPreviewVideo(video, inPlace.time, isCancelled)
    if (isCancelled()) return 'cancelled'
    onPositioned()
    return 'positioned'
  }

  if (inPlace.kind !== 'needs-reload' && inPlace.kind !== 'not-applicable') {
    return 'unavailable'
  }

  const url = await resolveUrl(
    resolvePreviewUrlStartSeconds(targetTime, allowLiveChunkSwitch, chunkSeconds),
  )
  if (!url) return 'unavailable'
  if (isCancelled()) return 'cancelled'

  const plan = planPreviewUrlSeek({
    url,
    loadedMediaId,
    mediaId,
    activeSrc,
    targetTime,
    videoDuration: video.duration || 0,
  })

  if (plan.kind === 'live') {
    setLiveMode(true)
    if (plan.reload) {
      video.removeAttribute('poster')
      video.src = url
      await waitForPreviewCanPlay(video, isCancelled, {live: true})
    }

    if (isCancelled()) return 'cancelled'
    if (!deferSeek && shouldApplyPreviewSeek(video.currentTime, plan.relative)) {
      await seekPreviewVideo(video, plan.relative, isCancelled, {
        timeoutMs: PREVIEW_INITIAL_SEEK_WAIT_MS,
      })
      if (isCancelled()) return 'cancelled'
    }
    onPositioned()
    return 'positioned'
  }

  setLiveMode(false)
  if (plan.reload) {
    video.removeAttribute('poster')
    // #t= steers the first decode toward the scrub point when the demuxer allows it.
    video.src = appendPreviewMediaFragment(url, plan.nextTime)
    await waitForPreviewCanPlay(video, isCancelled)
  }

  if (isCancelled()) return 'cancelled'
  // Mid-file seeks on NAS — thumb stays up (pending) until seek lands.
  if (!deferSeek && shouldApplyPreviewSeek(video.currentTime, plan.nextTime)) {
    await seekPreviewVideo(video, plan.nextTime, isCancelled, {
      timeoutMs: PREVIEW_INITIAL_SEEK_WAIT_MS,
    })
    if (isCancelled()) return 'cancelled'
  }
  onPositioned()
  return 'positioned'
}
