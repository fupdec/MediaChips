import {LIVE_STREAM_CHUNK_SECONDS} from './liveStreamChunk'

export const HOVER_PREVIEW_AFTER_BIG_PREVIEW_MS = 500
/** Must match `.preview video { transition: opacity … }` leave/enter fade. */
export const HOVER_PREVIEW_THUMB_CROSSFADE_MS = 520
/** Extra settle so the video fade-out finishes before <video> unmounts. */
export const HOVER_PREVIEW_THUMB_CROSSFADE_SETTLE_MS = 80

let hoverPreviewReadyAt = 0

export function armHoverPreviewCooldown(cooldownMs = HOVER_PREVIEW_AFTER_BIG_PREVIEW_MS) {
  hoverPreviewReadyAt = Date.now() + cooldownMs
}

export function getHoverPreviewCooldownRemaining() {
  return Math.max(0, hoverPreviewReadyAt - Date.now())
}

/** Drop post–big-preview cooldown (e.g. scroll-idle re-arm under the cursor). */
export function clearHoverPreviewCooldown() {
  hoverPreviewReadyAt = 0
}

/** Reset for tests only. */
export function resetHoverPreviewCooldownForTests() {
  hoverPreviewReadyAt = 0
}

export function isIgnorablePreviewError(error: unknown): boolean {
  const name = (error as {name?: string})?.name || ''
  // NotAllowedError: handled by mute-retry — do not silently drop the session.
  return name === 'AbortError'
}

export function isNotAllowedPreviewError(error: unknown): boolean {
  return ((error as {name?: string})?.name || '') === 'NotAllowedError'
}

/** Play hover video; mute once and retry if Chromium blocks unmuted autoplay. */
export async function playHoverPreviewVideo(
  video: HTMLVideoElement,
): Promise<'played' | 'played-muted'> {
  try {
    await video.play()
    return 'played'
  } catch (error) {
    if (!isNotAllowedPreviewError(error) || video.muted) throw error
    video.muted = true
    await video.play()
    return 'played-muted'
  }
}

export const PREVIEW_SEEK_EPSILON = 0.12

/**
 * Direct hover canplay budget. Too low (e.g. 2.5s) breaks previews on NAS /
 * /Volumes before the first frame arrives; live fallback then thrash-encodes.
 */
export const HOVER_PREVIEW_DIRECT_CANPLAY_MS = 8_000
/** Live FFmpeg warm-up window for hover previews. */
export const HOVER_PREVIEW_LIVE_CANPLAY_MS = 45_000
/** Cap live hover encode height — full player quality is wasted on a card. */
export const HOVER_PREVIEW_LIVE_MAX_HEIGHT = 360

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

export type HoverPreviewTeardownKind =
  | 'yield-decoder'
  | 'unavailable'
  | 'hide-immediate'
  | 'finalize-stop'
  | 'cancel-hover'
  | 'preview-hidden'
  | 'playback-error'

export type HoverPreviewTeardownPlan = {
  bumpToken: boolean
  resetReady: boolean
  clearAllowHoverVideo: boolean
  clearSeekCoalescer: boolean
  clearDelayTimer: boolean
  stopLive: boolean
  releaseSession: boolean
  abortVideo: boolean
  setPlaybackError: boolean
  clearPlaybackError: boolean
  zeroPlaybackTime: boolean
}

const TEARDOWN_NONE: HoverPreviewTeardownPlan = {
  bumpToken: false,
  resetReady: false,
  clearAllowHoverVideo: false,
  clearSeekCoalescer: false,
  clearDelayTimer: false,
  stopLive: false,
  releaseSession: false,
  abortVideo: false,
  setPlaybackError: false,
  clearPlaybackError: false,
  zeroPlaybackTime: false,
}

/** Pure action bag for the seven near-duplicate hover teardown recipes. */
export function resolveHoverPreviewTeardownPlan(
  kind: HoverPreviewTeardownKind,
): HoverPreviewTeardownPlan {
  switch (kind) {
    case 'yield-decoder':
      return {
        ...TEARDOWN_NONE,
        bumpToken: true,
        resetReady: true,
        clearAllowHoverVideo: true,
        clearSeekCoalescer: true,
        clearDelayTimer: true,
        stopLive: true,
        abortVideo: true,
      }
    case 'unavailable':
      return {
        ...TEARDOWN_NONE,
        setPlaybackError: true,
        clearAllowHoverVideo: true,
        resetReady: true,
        stopLive: true,
        abortVideo: true,
        releaseSession: true,
      }
    case 'hide-immediate':
      return {
        ...TEARDOWN_NONE,
        bumpToken: true,
        resetReady: true,
        clearAllowHoverVideo: true,
        stopLive: true,
        releaseSession: true,
        abortVideo: true,
      }
    case 'finalize-stop':
      return {
        ...TEARDOWN_NONE,
        bumpToken: true,
        clearPlaybackError: true,
        zeroPlaybackTime: true,
        resetReady: true,
        clearAllowHoverVideo: true,
        stopLive: true,
        releaseSession: true,
        abortVideo: true,
      }
    case 'cancel-hover':
      // Soft leave-grace: keep video/session alive until stopPlayingPreview finalizes.
      // Re-enter within the leave timer can cancel the pending stop without remount.
      // Reset ready so the thumb covers mid-seek frames during leave.
      return {
        ...TEARDOWN_NONE,
        resetReady: true,
        clearSeekCoalescer: true,
        clearDelayTimer: true,
      }
    case 'preview-hidden':
      return {
        ...TEARDOWN_NONE,
        resetReady: true,
        stopLive: true,
        releaseSession: true,
        abortVideo: true,
      }
    case 'playback-error':
      return {
        ...TEARDOWN_NONE,
        bumpToken: true,
        clearDelayTimer: true,
        clearAllowHoverVideo: true,
        resetReady: true,
        stopLive: true,
        abortVideo: true,
      }
  }
}

export type HoverPreviewStartGate = 'proceed' | 'unavailable' | 'abort'

/** Whether scheduleHoverPreviewUi should arm delayed video playback. */
export function shouldScheduleHoverPreviewVideo(input: {
  isHovered: boolean
  videoPreviewHover: string
}): boolean {
  return input.isHovered && input.videoPreviewHover === 'video'
}

/** Clamp settings delay for schedulePreviewPlayback (cap so hover never feels dead). */
export function resolveHoverPreviewScheduleDelay(delaySetting: unknown): number {
  const configured = Math.max(0, Number(delaySetting) || 0)
  return Math.min(configured, 2000)
}

/** Fixed-clip progress/playbackTime values, or null when no start is set. */
export function resolveFixedPreviewClipState(
  previewStartTime: number | null | undefined,
): {progress: number; playbackTime: number} | null {
  if (previewStartTime == null) return null
  return {progress: previewStartTime, playbackTime: previewStartTime}
}

export function resolveHoverPreviewStartGate(input: {
  hasVideo: boolean
  isPreviewVisible: boolean
  tokenMatches: boolean
  isHovered: boolean
  playerBlocksLive: boolean
}): HoverPreviewStartGate {
  if (!input.hasVideo || !input.isPreviewVisible) {
    return input.tokenMatches && input.isHovered ? 'unavailable' : 'abort'
  }
  if (input.playerBlocksLive) return 'abort'
  return 'proceed'
}

export type HoverPreviewUrlReadyGate = 'continue' | 'abort' | 'unavailable'

export function resolveHoverPreviewUrlReadyGate(input: {
  isHovered: boolean
  hasPreviewUrl: boolean
}): HoverPreviewUrlReadyGate {
  if (!input.isHovered) return 'abort'
  if (!input.hasPreviewUrl) return 'unavailable'
  return 'continue'
}

export type HoverPreviewAfterMountGate = 'start' | 'teardown-stale' | 'unavailable'

export function resolveHoverPreviewAfterMountGate(input: {
  isHovered: boolean
  allowHoverVideo: boolean
  hasVideoEl: boolean
}): HoverPreviewAfterMountGate {
  if (!input.isHovered || !input.allowHoverVideo) return 'teardown-stale'
  if (!input.hasVideoEl) return 'unavailable'
  return 'start'
}

export type HoverPreviewAfterPositionGate = 'play' | 'unavailable' | 'release' | 'abort'

export function resolveHoverPreviewAfterPositionGate(input: {
  positioned: boolean
  tokenMatches: boolean
  isPreviewVisible: boolean
}): HoverPreviewAfterPositionGate {
  if (!input.positioned) {
    return input.tokenMatches ? 'unavailable' : 'abort'
  }
  if (!input.tokenMatches || !input.isPreviewVisible) {
    return input.tokenMatches ? 'release' : 'abort'
  }
  return 'play'
}

export type HoverPreviewPlaybackErrorGate = 'release' | 'unavailable'

export function resolveHoverPreviewPlaybackErrorGate(input: {
  tokenMatches: boolean
  ignorable: boolean
}): HoverPreviewPlaybackErrorGate {
  if (!input.tokenMatches || input.ignorable) return 'release'
  return 'unavailable'
}

export type HoverPreviewSourcePlan =
  | {kind: 'direct'; streamMode: 'direct'}
  | {kind: 'live'}
  | {kind: 'unavailable'}

/**
 * Hover preview source: browser-safe codecs always try direct first (including
 * container_layout). Codec-incompatible formats show the unavailable notice on
 * the thumb — live FFmpeg stays for the cinema player / direct-fail fallback.
 */
export function resolveHoverPreviewSourcePlan(input: {
  mode?: string | null
  transcodeRequired?: boolean
  streamPlayback?: boolean
  reason?: string | null
  playability?: {playable?: boolean; needsRemux?: boolean} | null
  transcodeEnabled: boolean
}): HoverPreviewSourcePlan {
  if (input.mode === 'unsupported') return {kind: 'unavailable'}

  const isLayout = input.reason === 'container_layout'
    || input.playability?.needsRemux === true
  const codecsBrowserSafe = input.playability?.playable === true || isLayout

  if (input.mode === 'direct' || codecsBrowserSafe) {
    // Always direct for hover: auto re-probes on every byte-range request.
    return {
      kind: 'direct',
      streamMode: 'direct',
    }
  }

  // HEVC / MKV / bad audio: do not auto-start live on the card — show notice.
  return {kind: 'unavailable'}
}

/** After direct hover fails, try one live FFmpeg stream before the unavailable notice. */
export function shouldAttemptHoverLiveFallback(input: {
  alreadyLive: boolean
  fallbackAttempted: boolean
  transcodeEnabled: boolean
}): boolean {
  return !input.alreadyLive && !input.fallbackAttempted && input.transcodeEnabled
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

const PREVIEW_SEEK_WAIT_MS = 400

function waitForSeekedOrTimeout(
  video: HTMLVideoElement,
  isCancelled: () => boolean,
  timeoutMs = PREVIEW_SEEK_WAIT_MS,
): Promise<void> {
  return new Promise((resolve) => {
    if (isCancelled()) {
      resolve()
      return
    }

    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      video.removeEventListener('seeked', onSeeked)
      resolve()
    }

    const onSeeked = () => finish()
    const timeoutId = setTimeout(finish, timeoutMs)
    video.addEventListener('seeked', onSeeked, {once: true})

    if (isCancelled()) {
      finish()
    }
  })
}

/** Wait for an in-flight seek (or resolve immediately when not seeking). */
export function waitForPreviewSeek(
  video: HTMLVideoElement,
  isCancelled: () => boolean,
): Promise<void> {
  if (isCancelled()) return Promise.resolve()
  if (!video.seeking) return Promise.resolve()
  return waitForSeekedOrTimeout(video, isCancelled)
}

/**
 * Seek and wait for settle. Arms `seeked` before assigning currentTime so
 * Chromium's async seeking flag cannot skip the wait (first-frame flash).
 */
export function seekPreviewVideo(
  video: HTMLVideoElement,
  time: number,
  isCancelled: () => boolean,
): Promise<void> {
  if (isCancelled()) return Promise.resolve()
  if (!shouldApplyPreviewSeek(video.currentTime, time)) return Promise.resolve()

  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      video.removeEventListener('seeked', onSeeked)
      resolve()
    }

    const onSeeked = () => finish()
    const timeoutId = setTimeout(finish, PREVIEW_SEEK_WAIT_MS)
    video.addEventListener('seeked', onSeeked, {once: true})

    try {
      video.currentTime = time
    } catch {
      finish()
      return
    }

    // Seeking may flip true only on the next microtask; if it never starts and
    // we are already on-target, resolve without waiting for the timeout.
    queueMicrotask(() => {
      if (settled || isCancelled()) {
        finish()
        return
      }
      if (!video.seeking && !shouldApplyPreviewSeek(video.currentTime, time)) {
        finish()
      }
    })
  })
}

export function resolveHoverLiveMaxHeight(settingsMaxHeight: unknown): string {
  const num = Number(settingsMaxHeight)
  if (!Number.isFinite(num) || num <= 0) return String(HOVER_PREVIEW_LIVE_MAX_HEIGHT)
  return String(Math.min(num, HOVER_PREVIEW_LIVE_MAX_HEIGHT))
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

    // One decoded frame is enough to reveal the hover card; waiting for
    // HAVE_FUTURE_DATA added multi-second stalls on slow volumes.
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      resolve()
      return
    }

    const cleanup = () => {
      clearTimeout(timeoutId)
      video.removeEventListener('loadeddata', onReady)
      video.removeEventListener('canplay', onReady)
      video.removeEventListener('error', onError)
    }

    const onReady = () => {
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
    }, live ? HOVER_PREVIEW_LIVE_CANPLAY_MS : HOVER_PREVIEW_DIRECT_CANPLAY_MS)

    video.addEventListener('loadeddata', onReady, {once: true})
    video.addEventListener('canplay', onReady, {once: true})
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
