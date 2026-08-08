import {
  decideInPlacePreviewSeek,
  getLoadedPreviewMediaId,
  planPreviewUrlSeek,
  resolvePreviewUrlStartSeconds,
  shouldApplyPreviewSeek,
  waitForPreviewCanPlay,
  waitForPreviewSeek,
  seekPreviewVideo,
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
      video.src = url
      await waitForPreviewCanPlay(video, isCancelled, {live: true})
    }

    if (isCancelled()) return 'cancelled'
    if (shouldApplyPreviewSeek(video.currentTime, plan.relative)) {
      await seekPreviewVideo(video, plan.relative, isCancelled)
      if (isCancelled()) return 'cancelled'
    }
    onPositioned()
    return 'positioned'
  }

  setLiveMode(false)
  if (plan.reload) {
    video.src = url
    await waitForPreviewCanPlay(video, isCancelled)
  }

  if (isCancelled()) return 'cancelled'
  if (shouldApplyPreviewSeek(video.currentTime, plan.nextTime)) {
    await seekPreviewVideo(video, plan.nextTime, isCancelled)
    if (isCancelled()) return 'cancelled'
  }
  onPositioned()
  return 'positioned'
}
