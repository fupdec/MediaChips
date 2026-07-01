import {
  getChunkStart,
} from '@/utils/liveStreamChunk'
import { typedApi } from '@/services/typedApi'
import {
  apiVideoStream,
  apiVideoTranscodeStream,
} from '@shared/api/routes'
import type { PlayableInfo } from '@shared/schemas/transcode'

const LIVE_STREAM_RETRY_DELAY_MS = 400

type BuildApiUrl = (path: string, baseUrl?: string) => string

export type { PlayableInfo, TranscodeCacheStats } from '@shared/schemas/transcode'

export function fetchPlayableInfo(mediaId: number): Promise<PlayableInfo> {
  return typedApi.getVideoPlayable(mediaId).then((response) => response.data)
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
) {
  const start = getChunkStart(startSeconds)
  const params = new URLSearchParams({
    start: String(start),
    time: String(Math.random()),
  })

  if (maxHeight != null && maxHeight !== '') {
    params.set('maxHeight', String(maxHeight))
  }

  return `${buildApiUrl(apiVideoTranscodeStream(mediaId))}?${params.toString()}`
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
) {
  try {
    const playable = await fetchPlayableInfo(mediaId)
    if (playable.mode === 'unsupported') {
      return null
    }
    if (playable.transcodeRequired || playable.streamPlayback || playable.mode === 'stream') {
      return buildLiveStreamUrl(buildApiUrl, mediaId, startSeconds)
    }
    return buildVideoStreamUrl(buildApiUrl, mediaId, 'auto')
  } catch {
    return buildVideoStreamUrl(buildApiUrl, mediaId, 'auto')
  }
}

const MEDIA_ERR_ABORTED = 1
const MEDIA_ERR_NETWORK = 2
const MEDIA_ERR_DECODE = 3
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4

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
  { retries = 6, timeout = 60000 } = {},
) {
  let lastError: unknown

  for (let attempt = 0; attempt < retries; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => {
        window.setTimeout(resolve, LIVE_STREAM_RETRY_DELAY_MS * attempt * attempt)
      })
    }

    videoEl.src = getStreamUrl()

    try {
      await playWhenReady(videoEl, { timeout })
      return
    } catch (error) {
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
