import {
  getChunkStart,
} from '@/utils/liveStreamChunk'
import { abortVideoPlayback } from '@/utils/liveTranscodeLifecycle'
import { typedApi } from '@/services/typedApi'
import {
  apiVideoStream,
  apiVideoTranscodeStream,
} from '@shared/api/routes'
import type { PlayableInfo } from '@shared/schemas/transcode'

const LIVE_STREAM_RETRY_DELAY_MS = 400
const PLAYABLE_INFO_CACHE_TTL_MS = 5 * 60 * 1000

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

export function buildVideoStreamUrl(buildApiUrl: BuildApiUrl, mediaId: number, source = 'auto') {
  return `${buildApiUrl(apiVideoStream(mediaId))}?source=${source}&time=${Math.random()}`
}

export function buildLiveStreamUrl(
  buildApiUrl: BuildApiUrl,
  mediaId: number,
  startSeconds = 0,
  maxHeight: number | string | null = null,
  options: {copyCompatible?: boolean} = {},
) {
  const start = getChunkStart(startSeconds)
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
  _startSeconds = 0,
) {
  try {
    const playable = await fetchPlayableInfo(mediaId)
    if (playable.mode === 'unsupported') {
      return null
    }
    // Hover preview never starts live transcoding — open the player instead.
    if (playable.transcodeRequired || playable.streamPlayback || playable.mode === 'stream') {
      return null
    }
    return buildVideoStreamUrl(buildApiUrl, mediaId, 'auto')
  } catch {
    return buildVideoStreamUrl(buildApiUrl, mediaId, 'auto')
  }
}

export function playWhenReady(videoEl: HTMLVideoElement | null, { timeout = 60000 } = {}) {
  return new Promise<void>((resolve, reject) => {
    if (!videoEl) {
      reject(new Error('No video element'))
      return
    }

    const tryPlay = () => {
      videoEl.play().then(resolve).catch(reject)
    }

    if (videoEl.readyState >= 3) {
      tryPlay()
      return
    }

    const timeoutRef: { id?: ReturnType<typeof setTimeout> } = {}

    const cleanup = () => {
      if (timeoutRef.id !== undefined) clearTimeout(timeoutRef.id)
      videoEl.removeEventListener('canplay', onCanPlay)
      videoEl.removeEventListener('error', onError)
    }

    const onCanPlay = () => {
      cleanup()
      tryPlay()
    }

    const onError = () => {
      cleanup()
      reject(videoEl.error || new Error('Video failed to load'))
    }

    timeoutRef.id = setTimeout(() => {
      cleanup()
      reject(new Error('Video load timeout'))
    }, timeout)

    videoEl.addEventListener('canplay', onCanPlay, { once: true })
    videoEl.addEventListener('error', onError, { once: true })
  })
}

export async function playLiveStreamWhenReady(
  videoEl: HTMLVideoElement,
  getStreamUrl: () => string,
  {
    retries = 6,
    timeout = 60000,
    isCancelled,
  }: {
    retries?: number
    timeout?: number
    isCancelled?: () => boolean
  } = {},
) {
  let lastError: unknown

  for (let attempt = 0; attempt < retries; attempt += 1) {
    if (isCancelled?.()) return

    if (attempt > 0) {
      await new Promise((resolve) => {
        window.setTimeout(resolve, LIVE_STREAM_RETRY_DELAY_MS * attempt * attempt)
      })
      if (isCancelled?.()) return
    }

    videoEl.src = getStreamUrl()

    try {
      await playWhenReady(videoEl, { timeout })
      if (isCancelled?.()) {
        abortVideoPlayback(videoEl)
        return
      }
      return
    } catch (error) {
      if (isCancelled?.()) return
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
