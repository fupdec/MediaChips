import { resolveHoverPreviewSourcePlan } from '@/utils/hoverPreviewPlayback'
import { getAuthToken } from '@/services/authSession'
import { typedApi } from '@/services/typedApi'
import {
  apiVideoStream,
  apiVideoTranscodeStream,
} from '@shared/api/routes'
import type { PlayableInfo } from '@shared/schemas/transcode'

const LIVE_STREAM_RETRY_DELAY_MS = 400
const PLAYABLE_INFO_CACHE_TTL_MS = 5 * 60 * 1000
const PLAYABLE_INFO_CACHE_MAX = 80

const MEDIA_ERR_ABORTED = 1
const MEDIA_ERR_NETWORK = 2
const MEDIA_ERR_DECODE = 3
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4

type BuildApiUrl = (path: string, baseUrl?: string) => string

export type { PlayableInfo, TranscodeCacheStats } from '@shared/schemas/transcode'

type PlayableCacheEntry = {
  value: PlayableInfo
  at: number
}

const playableInfoCache = new Map<number, PlayableCacheEntry>()
const playableInfoInFlight = new Map<number, Promise<PlayableInfo>>()

function trimPlayableInfoCache() {
  if (playableInfoCache.size <= PLAYABLE_INFO_CACHE_MAX) return
  const overflow = playableInfoCache.size - PLAYABLE_INFO_CACHE_MAX
  const keys = playableInfoCache.keys()
  for (let i = 0; i < overflow; i += 1) {
    const key = keys.next().value
    if (key == null) break
    playableInfoCache.delete(key)
  }
}
export function invalidatePlayableInfo(mediaId?: number) {
  if (mediaId == null) {
    playableInfoCache.clear()
    return
  }
  playableInfoCache.delete(mediaId)
}

export function fetchPlayableInfo(mediaId: number): Promise<PlayableInfo> {
  const cached = playableInfoCache.get(mediaId)
  if (cached && Date.now() - cached.at < PLAYABLE_INFO_CACHE_TTL_MS) {
    return Promise.resolve(cached.value)
  }

  const inFlight = playableInfoInFlight.get(mediaId)
  if (inFlight) return inFlight

  const request = typedApi.getVideoPlayable(mediaId)
    .then((response) => {
      playableInfoCache.set(mediaId, {value: response.data, at: Date.now()})
      trimPlayableInfoCache()
      return response.data
    })
    .finally(() => {
      playableInfoInFlight.delete(mediaId)
    })

  playableInfoInFlight.set(mediaId, request)
  return request
}

export function stopLiveTranscode(mediaId: number) {
  return typedApi.stopLiveTranscodeStream(mediaId).then((response) => response.data)
}

export function fetchTranscodeCacheStats() {
  return typedApi.getTranscodeCacheStats().then((response) => response.data)
}

function appendAuthToken(params: URLSearchParams) {
  const token = getAuthToken()
  if (token) params.set('token', token)
}

export function buildVideoStreamUrl(
  buildApiUrl: BuildApiUrl,
  mediaId: number,
  source = 'auto',
  {bustCache = true}: {bustCache?: boolean} = {},
) {
  const params = new URLSearchParams({source})
  // Hover previews reuse one stable URL so Chromium can drop prior buffers; the
  // full player keeps cache-busting when codecs/plan change.
  if (bustCache) {
    params.set('time', String(Math.random()))
  }
  appendAuthToken(params)
  return `${buildApiUrl(apiVideoStream(mediaId))}?${params.toString()}`
}

export function buildLiveStreamUrl(
  buildApiUrl: BuildApiUrl,
  mediaId: number,
  startSeconds = 0,
  maxHeight: number | string | null = null,
  options: {copyCompatible?: boolean; accurateSeek?: boolean} = {},
) {
  // Live fMP4 pipes are not byte-range seekable (Accept-Ranges: none).
  // Start ffmpeg at the exact timeline position — chunk-aligning here left
  // playback up to ~30s early when the UI tried an in-chunk currentTime seek.
  const start = Math.max(0, Number(startSeconds) || 0)
  const params = new URLSearchParams({
    start: String(start),
    time: String(Math.random()),
  })

  if (maxHeight != null && maxHeight !== '' && !options.copyCompatible) {
    params.set('maxHeight', String(maxHeight))
  }
  if (options.copyCompatible) {
    params.set('copy', '1')
  }
  if (options.accurateSeek) {
    params.set('accurate', '1')
  }
  appendAuthToken(params)

  return `${buildApiUrl(apiVideoTranscodeStream(mediaId))}?${params.toString()}`
}

/** Direct H.264/AAC can still fail in Chromium on pathological containers. */
export function shouldAttemptDirectPlaybackFallback({
  usesLiveTranscode,
  fallbackAttempted,
  transcodeEnabled,
  mediaErrorCode,
}: {
  usesLiveTranscode?: boolean
  fallbackAttempted?: boolean
  transcodeEnabled?: boolean
  mediaErrorCode?: number | null
}): boolean {
  if (usesLiveTranscode || fallbackAttempted || !transcodeEnabled) return false
  if (mediaErrorCode == null) return true
  return mediaErrorCode === MEDIA_ERR_DECODE || mediaErrorCode === MEDIA_ERR_SRC_NOT_SUPPORTED
}

export class UnsupportedPlaybackError extends Error {
  code: string

  constructor(message = 'unsupported_format') {
    super(message)
    this.name = 'UnsupportedPlaybackError'
    this.code = 'unsupported_format'
  }
}

export async function resolvePreviewVideoUrl(
  buildApiUrl: BuildApiUrl,
  mediaId: number,
  startSeconds = 0,
  options: {
    transcodeEnabled?: boolean
    preferLive?: boolean
    maxHeight?: number | string | null
    /** Skip /playable and return auto immediately (hover hot path). */
    optimistic?: boolean
  } = {},
) {
  try {
    if (options.preferLive) {
      return buildLiveStreamUrl(
        buildApiUrl,
        mediaId,
        startSeconds,
        options.maxHeight ?? null,
      )
    }

    if (options.optimistic) {
      return buildVideoStreamUrl(buildApiUrl, mediaId, 'direct', {bustCache: false})
    }

    const playable = await fetchPlayableInfo(mediaId)
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
      transcodeEnabled: options.transcodeEnabled !== false,
    })

    if (plan.kind === 'unavailable') return null
    if (plan.kind === 'live') {
      return buildLiveStreamUrl(
        buildApiUrl,
        mediaId,
        startSeconds,
        options.maxHeight ?? null,
      )
    }

    return buildVideoStreamUrl(
      buildApiUrl,
      mediaId,
      plan.streamMode,
      {bustCache: false},
    )
  } catch {
    return buildVideoStreamUrl(buildApiUrl, mediaId, 'auto')
  }
}

export function playWhenReady(videoEl: HTMLVideoElement | null, {
  timeout = 60000, signal,
}: {timeout?: number; signal?: AbortSignal} = {}) {
  return new Promise<void>((resolve, reject) => {
    if (!videoEl) {
      reject(new Error('No video element'))
      return
    }

    if (signal?.aborted) { reject(new DOMException('Playback cancelled', 'AbortError')); return }
    if (videoEl.error) { reject(videoEl.error); return }

    const tryPlay = () => {
      videoEl.play().then(() => { cleanup(); resolve() }, error => { cleanup(); reject(error) })
    }

    const timeoutRef: { id?: ReturnType<typeof setTimeout> } = {}

    const cleanup = () => {
      if (timeoutRef.id !== undefined) clearTimeout(timeoutRef.id)
      videoEl.removeEventListener('canplay', onCanPlay)
      videoEl.removeEventListener('error', onError)
      signal?.removeEventListener('abort', onAbort)
    }

    const onCanPlay = () => {
      videoEl.removeEventListener('canplay', onCanPlay)
      tryPlay()
    }

    const onError = () => {
      cleanup()
      reject(videoEl.error || new Error('Video failed to load'))
    }
    const onAbort = () => {
      cleanup()
      reject(new DOMException('Playback cancelled', 'AbortError'))
    }

    timeoutRef.id = setTimeout(() => {
      cleanup()
      reject(new Error('Video load timeout'))
    }, timeout)

    videoEl.addEventListener('canplay', onCanPlay, { once: true })
    videoEl.addEventListener('error', onError, { once: true })
    signal?.addEventListener('abort', onAbort, {once: true})
    if (videoEl.readyState >= 3) onCanPlay()
  })
}

export async function playLiveStreamWhenReady(
  videoEl: HTMLVideoElement,
  getStreamUrl: () => string,
  {
    retries = 2,
    timeout = 15000,
    isCancelled,
    signal,
    reuseSource = false,
  }: {
    retries?: number
    timeout?: number
    isCancelled?: () => boolean
    signal?: AbortSignal
    reuseSource?: boolean
  } = {},
) {
  let lastError: unknown
  const cancelled = () => signal?.aborted || isCancelled?.()

  for (let attempt = 0; attempt < retries; attempt += 1) {
    if (cancelled()) return

    if (attempt > 0) {
      await new Promise<void>((resolve) => {
        const finish = () => { window.clearTimeout(timer); signal?.removeEventListener('abort', finish); resolve() }
        const timer = window.setTimeout(finish, LIVE_STREAM_RETRY_DELAY_MS * attempt * attempt)
        signal?.addEventListener('abort', finish, {once: true})
      })
      if (cancelled()) return
    }

    if (attempt > 0 || !reuseSource || !videoEl.src) videoEl.src = getStreamUrl()

    try {
      await playWhenReady(videoEl, { timeout, signal })
      // A newer seek owns the element now. Never clear its source here.
      if (cancelled()) return
      return
    } catch (error) {
      if (cancelled()) return
      lastError = error
      if (attempt >= retries - 1) break

      const code = videoEl.error?.code
      if (code != null
        && code !== MEDIA_ERR_SRC_NOT_SUPPORTED
        && code !== MEDIA_ERR_NETWORK
        && code !== MEDIA_ERR_DECODE
        && code !== MEDIA_ERR_ABORTED) {
        break
      }
    }
  }

  throw lastError || new Error('Live stream playback failed')
}
