import {apiClient, buildApiUrl} from './apiClient'
import {getAuthToken} from './authSession'
import {WebVideoPlayableSchema} from '@shared/webVideo'
import type Hls from 'hls.js'
import {isDriveMediaPath, parseDriveMediaPath} from '@shared/cloudDrive'
import {isNasMediaPath, parseNasMediaPath} from '@shared/remoteMedia'

const players = new WeakMap<HTMLVideoElement, Hls>()

export function disposeWebVideo(video: HTMLVideoElement | null) {
  if (!video) return
  players.get(video)?.destroy()
  players.delete(video)
}

export async function prepareWebVideoPlayback(mediaId: number, options: {quality?: number | null; fresh?: boolean; path?: string; signal?: AbortSignal} = {}) {
  const drivePreview = mediaId === 0 ? parseDriveMediaPath(options.path) : null
  if (drivePreview) {
    const token = getAuthToken()
    const url = buildApiUrl(`/api/drive/files/${drivePreview}/stream`)
    return WebVideoPlayableSchema.parse({url: token ? `${url}?token=${encodeURIComponent(token)}` : url, kind: 'mp4', title: ''})
  }
  const params: Record<string, string | number> = {}
  if (options.quality != null) params.quality = options.quality
  if (options.fresh) params.fresh = '1'
  const preview = mediaId === 0 ? parseNasMediaPath(options.path) : null
  if (preview) {
    delete params.quality
    delete params.fresh
    params.path = preview.relativePath
  }
  const route = preview ? `/api/nas/connections/${preview.connectionId}/playable`
    : isDriveMediaPath(options.path) ? `/api/drive/media/${mediaId}/playable`
    : isNasMediaPath(options.path) ? `/api/nas/media/${mediaId}/playable` : `/api/web-video/${mediaId}/playable`
  const response = await apiClient.get(route, {timeout: 180_000, params, signal: options.signal})
  const data = WebVideoPlayableSchema.parse(response.data)
  const token = getAuthToken()
  const url = buildApiUrl(data.url)
  return {...data, url: token ? `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : url}
}

export async function attachWebVideo(
  video: HTMLVideoElement,
  source: Awaited<ReturnType<typeof prepareWebVideoPlayback>>,
  isStale: () => boolean,
  onError: (message: string) => void,
  startTime = 0,
) {
  video.crossOrigin = 'anonymous'
  if (source.kind === 'mp4' || video.canPlayType('application/vnd.apple.mpegurl')) {
    if (!isStale()) video.src = source.url
    return
  }
  const {default: Hls} = await import('hls.js')
  if (isStale()) return
  if (!Hls.isSupported()) throw new Error('HLS playback is not supported in this browser.')
  disposeWebVideo(video)
  const hls = new Hls({
    maxBufferLength: 30, maxMaxBufferLength: 60, maxBufferSize: 30 * 1024 * 1024,
    backBufferLength: 30, startPosition: startTime,
  })
  let manifestReady = false
  players.set(video, hls)
  hls.on(Hls.Events.ERROR, (_event, error) => {
    if (!error.fatal || isStale() || !manifestReady) return
    onError('The remote video stream is unavailable. Open the video again to refresh it.')
    disposeWebVideo(video)
  })
  await new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      window.clearTimeout(timer)
      hls.off(Hls.Events.MANIFEST_PARSED, onParsed)
      hls.off(Hls.Events.ERROR, onFailure)
      hls.off(Hls.Events.DESTROYING, onDestroyed)
      if (error) reject(error)
      else resolve()
    }
    const onParsed = () => { manifestReady = true; finish() }
    const onDestroyed = () => finish()
    const onFailure = (_event: string, error: {fatal: boolean}) => {
      if (error.fatal) {
        finish(new Error('Unable to load the HLS video stream.'))
        disposeWebVideo(video)
      }
    }
    const timer = window.setTimeout(() => {
      finish(new Error('The HLS video stream did not respond in time.'))
      disposeWebVideo(video)
    }, 30_000)
    hls.on(Hls.Events.MANIFEST_PARSED, onParsed)
    hls.on(Hls.Events.ERROR, onFailure)
    hls.on(Hls.Events.DESTROYING, onDestroyed)
    hls.loadSource(source.url)
    hls.attachMedia(video)
  })
}
