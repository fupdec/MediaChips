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
