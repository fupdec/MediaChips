import {LIVE_STREAM_CHUNK_SECONDS} from './liveStreamChunk'

export const HOVER_PREVIEW_AFTER_BIG_PREVIEW_MS = 500

let hoverPreviewReadyAt = 0

export function armHoverPreviewCooldown(cooldownMs = HOVER_PREVIEW_AFTER_BIG_PREVIEW_MS) {
  hoverPreviewReadyAt = Date.now() + cooldownMs
}

export function getHoverPreviewCooldownRemaining() {
  return Math.max(0, hoverPreviewReadyAt - Date.now())
}

/** Reset for tests only. */
export function resetHoverPreviewCooldownForTests() {
  hoverPreviewReadyAt = 0
}

export function isIgnorablePreviewError(error: unknown): boolean {
  const name = (error as {name?: string})?.name || ''
  return name === 'AbortError' || name === 'NotAllowedError'
}

export const PREVIEW_SEEK_EPSILON = 0.12

export function shouldApplyPreviewSeek(
  currentTime: number,
  nextTime: number,
  epsilon = PREVIEW_SEEK_EPSILON,
): boolean {
  return Number.isFinite(nextTime) && Math.abs(currentTime - nextTime) > epsilon
}

export type InPlacePreviewSeekDecision =
  | {kind: 'not-applicable'}
  | {kind: 'noop'}
  | {kind: 'busy'}
  | {kind: 'seek'; time: number}
  | {kind: 'needs-reload'}

export function decideInPlacePreviewSeek(input: {
  loadedMediaId: number | null
  mediaId: number
  activeSrc: string
  targetTime: number
  allowLiveChunkSwitch: boolean
  currentTime: number
  seeking: boolean
  videoDuration: number
}): InPlacePreviewSeekDecision {
  if (input.loadedMediaId !== input.mediaId || !input.activeSrc) {
    return {kind: 'not-applicable'}
  }

  const isLiveSrc = input.activeSrc.includes('/transcode/stream')
  if (isLiveSrc) {
    const currentStart = Number(getPreviewStreamStart(input.activeSrc) || 0)
    const {withinCurrentSegment, relativeTime} = clampLiveChunkSeek(
      input.targetTime,
      currentStart,
    )
    if (!(withinCurrentSegment || !input.allowLiveChunkSwitch)) {
      return {kind: 'needs-reload'}
    }
    if (!shouldApplyPreviewSeek(input.currentTime, relativeTime)) {
      return {kind: 'noop'}
    }
    if (input.seeking) return {kind: 'busy'}
    return {kind: 'seek', time: relativeTime}
  }

  const nextTime = Math.min(input.targetTime, input.videoDuration || input.targetTime)
  if (!shouldApplyPreviewSeek(input.currentTime, nextTime)) {
    return {kind: 'noop'}
  }
  if (input.seeking) return {kind: 'busy'}
  return {kind: 'seek', time: nextTime}
}


export function canMarkHoverPreviewReady(input: {
  isHovered: boolean
  isPreviewVisible: boolean
  isBigPreviewVisual: boolean
}): boolean {
  return input.isHovered && input.isPreviewVisible && !input.isBigPreviewVisual
}

export function shouldRestartFixedPreviewClip(input: {
  previewStartTime?: number | null
  previewEndTime?: number | null
  playbackTime: number
}): boolean {
  return (
    input.previewEndTime != null &&
    input.previewStartTime != null &&
    input.playbackTime > input.previewEndTime
  )
}

export function resolveHoverPreviewTargetTime(input: {
  hasFixedPreviewTime: boolean
  previewStartTime?: number | null
  progress: number
}): number {
  if (input.hasFixedPreviewTime && input.previewStartTime != null) {
    return input.previewStartTime
  }
  return input.progress
}

export function getPreviewStreamStart(url: string): string | null {
  try {
    return new URL(url).searchParams.get('start')
  } catch {
    return null
  }
}

/** Whether a live-stream preview URL must replace the current video src. */
export function shouldReloadLivePreviewSrc(input: {
  loadedMediaId: number | null
  mediaId: number
  activeSrc: string
  nextUrl: string
}): boolean {
  const nextStart = getPreviewStreamStart(input.nextUrl)
  const currentStart = input.activeSrc.includes('/transcode/stream')
    && input.loadedMediaId === input.mediaId
    ? getPreviewStreamStart(input.activeSrc)
    : null
  return input.loadedMediaId !== input.mediaId || currentStart !== nextStart
}

export function resolveLivePreviewRelativeTime(
  targetTime: number,
  streamStart: number,
): number {
  return Math.max(0, targetTime - streamStart)
}

export function shouldComputeHoverPreviewPointerTime(input: {
  hasFixedPreviewTime: boolean
  isFileExists: boolean
  playbackError: boolean
  videoPreviewHover: string
  mediaDuration: number
}): boolean {
  if (input.hasFixedPreviewTime) return false
  if (!input.isFileExists || input.playbackError) return false
  if (input.videoPreviewHover !== 'video') return false
  return Boolean(input.mediaDuration)
}

export function resolveHoverScrubProgressUpdate(input: {
  progressValue: number
  currentProgress: number
  showPlaybackTimeline: boolean
}): {progress: number; playbackTime?: number} | null {
  if (input.currentProgress === input.progressValue) return null
  return {
    progress: input.progressValue,
    ...(input.showPlaybackTimeline ? {} : {playbackTime: input.progressValue}),
  }
}

export function resolvePreviewUrlStartSeconds(
  targetTime: number,
  allowLiveChunkSwitch: boolean,
  chunkSeconds: number,
): number {
  return allowLiveChunkSwitch
    ? targetTime
    : Math.min(targetTime, chunkSeconds - 0.1)
}

export type PreviewUrlSeekPlan =
  | {
    kind: 'live'
    reload: boolean
    streamStart: number
    relative: number
  }
  | {
    kind: 'file'
    reload: boolean
    nextTime: number
  }

/** After a preview URL is known, decide live vs file seek/reload. */
export function planPreviewUrlSeek(input: {
  url: string
  loadedMediaId: number | null
  mediaId: number
  activeSrc: string
  targetTime: number
  videoDuration: number
}): PreviewUrlSeekPlan {
  const isLive = input.url.includes('/transcode/stream')
  if (isLive) {
    const streamStart = Number(getPreviewStreamStart(input.url) || 0)
    return {
      kind: 'live',
      reload: shouldReloadLivePreviewSrc({
        loadedMediaId: input.loadedMediaId,
        mediaId: input.mediaId,
        activeSrc: input.activeSrc,
        nextUrl: input.url,
      }),
      streamStart,
      relative: resolveLivePreviewRelativeTime(input.targetTime, streamStart),
    }
  }
  return {
    kind: 'file',
    reload: input.loadedMediaId !== input.mediaId,
    nextTime: Math.min(input.targetTime, input.videoDuration || input.targetTime),
  }
}

export function getLoadedPreviewMediaId(
  video: Pick<HTMLVideoElement, 'currentSrc'>,
  pageHref = typeof window !== 'undefined' ? window.location.href : '',
): number | null {
  // Prefer currentSrc — after abort(), .src falls back to the page URL and can
  // falsely match media ids that appear in the host/port (e.g. 3000).
  const raw = video.currentSrc || ''
  if (!raw || raw === pageHref) return null
  const match = raw.match(/\/api\/video\/(\d+)(?:\/|\?|$)/)
  if (!match) return null
  return Number(match[1])
}

export function pointerRatioToPreviewTime(
  clientX: number,
  rect: Pick<DOMRect, 'left' | 'width'>,
  durationSeconds: number,
): number | null {
  if (!durationSeconds || rect.width <= 0) return null
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  return Math.floor(durationSeconds * ratio)
}

export function resolveAbsolutePreviewTime(
  videoCurrentTime: number,
  options: {live: boolean; streamUrl?: string | null},
): number {
  if (!Number.isFinite(videoCurrentTime)) return 0
  if (!options.live) return videoCurrentTime
  const startParam = options.streamUrl ? getPreviewStreamStart(options.streamUrl) : null
  const streamStart = startParam != null ? Number(startParam) : 0
  return streamStart + videoCurrentTime
}

export function clampLiveChunkSeek(
  targetTime: number,
  currentStart: number,
  chunkSeconds = LIVE_STREAM_CHUNK_SECONDS,
): {withinCurrentSegment: boolean; relativeTime: number; clampedAbsolute: number} {
  const maxInChunk = currentStart + chunkSeconds - 0.05
  const withinCurrentSegment = targetTime >= currentStart - 0.05 && targetTime <= maxInChunk
  const clampedAbsolute = Math.min(
    Math.max(targetTime, currentStart),
    Math.max(currentStart, maxInChunk),
  )
  const relativeTime = Math.max(0, clampedAbsolute - currentStart)
  return {withinCurrentSegment, relativeTime, clampedAbsolute}
}

export function waitForPreviewSeek(
  video: HTMLVideoElement,
  isCancelled: () => boolean,
): Promise<void> {
  return new Promise((resolve) => {
    if (isCancelled()) {
      resolve()
      return
    }

    if (video.seeking) {
      const onSeeked = () => {
        clearTimeout(timeoutId)
        resolve()
      }
      const timeoutId = setTimeout(() => {
        video.removeEventListener('seeked', onSeeked)
        resolve()
      }, 400)
      video.addEventListener('seeked', onSeeked, {once: true})
      return
    }

    resolve()
  })
}

export function waitForPreviewCanPlay(
  video: HTMLVideoElement,
  isCancelled: () => boolean,
  {live = false}: {live?: boolean} = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (isCancelled()) {
      reject(new Error('Preview playback cancelled'))
      return
    }

    if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      resolve()
      return
    }

    const cleanup = () => {
      clearTimeout(timeoutId)
      video.removeEventListener('canplay', onCanPlay)
      video.removeEventListener('error', onError)
    }

    const onCanPlay = () => {
      cleanup()
      resolve()
    }

    const onError = () => {
      cleanup()
      reject(video.error || new Error('Video failed to load'))
    }

    // Live FFmpeg warm-up often exceeds the direct-play window.
    const timeoutId = setTimeout(() => {
      cleanup()
      reject(new Error(live ? 'Live preview timed out' : 'Preview timed out'))
    }, live ? 45_000 : 8_000)

    video.addEventListener('canplay', onCanPlay, {once: true})
    video.addEventListener('error', onError, {once: true})
  })
}

export type HoverSeekCoalescer = {
  schedule: (clientX: number) => void
  flush: (targetTime: number) => void
  clear: () => void
}

/** Coalesce pointer scrub seeks so live/direct playback is not flooded. */
export function createHoverSeekCoalescer(options: {
  resolveTime: (clientX: number) => number | null
  sync: (targetTime: number) => Promise<unknown>
  delayMs?: number
}): HoverSeekCoalescer {
  let timer: ReturnType<typeof setTimeout> | null = null
  let inFlight = false
  let pending: number | null = null
  const delayMs = options.delayMs ?? 220

  const flush = (targetTime: number) => {
    if (inFlight) {
      pending = targetTime
      return
    }
    inFlight = true
    void options.sync(targetTime)
      .catch(() => {})
      .finally(() => {
        inFlight = false
        if (pending == null) return
        const next = pending
        pending = null
        flush(next)
      })
  }

  return {
    schedule(clientX) {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        const progressValue = options.resolveTime(clientX)
        if (progressValue == null) return
        flush(progressValue)
      }, delayMs)
    },
    flush,
    clear() {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      inFlight = false
      pending = null
    },
  }
}
