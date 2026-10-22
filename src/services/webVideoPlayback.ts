import {sourceRetryAfter} from '@shared/sourceErrors'
import {parseCloudMediaPath, isCloudMediaPath} from '@shared/cloudAccounts'
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

export async function prepareWebVideoPlayback(mediaId: number, options: {quality?: number | null; fresh?: boolean; path?: string; copies?: boolean; signal?: AbortSignal} = {}) {
  const cloud = parseCloudMediaPath(options.path)
  if (mediaId === 0 && cloud) {
    const token = getAuthToken()
    const url = buildApiUrl(`/api/cloud-accounts/${cloud.connectionId}/stream?key=${encodeURIComponent(cloud.resourceKey)}`)
    return WebVideoPlayableSchema.parse({url: token ? `${url}&token=${encodeURIComponent(token)}` : url, kind: 'mp4', title: ''})
  }
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
  const route = options.copies && mediaId > 0 ? `/api/Media/${mediaId}/copies/playable` : preview ? `/api/nas/connections/${preview.connectionId}/playable`
    : isCloudMediaPath(options.path) ? `/api/cloud-accounts/media/${mediaId}/playable`
    : isDriveMediaPath(options.path) ? `/api/drive/media/${mediaId}/playable`
    : isNasMediaPath(options.path) ? `/api/nas/media/${mediaId}/playable` : `/api/web-video/${mediaId}/playable`
  const response = await apiClient.get(route, {timeout: 180_000, params, signal: options.signal})
  const data = WebVideoPlayableSchema.parse(response.data)
  const token = getAuthToken()
  const url = buildApiUrl(data.url)
  return {...data, url: token ? `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : url}
}

export function hlsFailureCode(error: {type?: string; details?: string; response?: {code?: number}}): string {
  const status = error.response?.code
  if (status === 404) return 'not_found'
  if (status === 410) return 'session_expired'
  if (status === 401) return 'auth_required'
  if (status === 403) return 'permission_denied'
  if (status === 429) return 'rate_limited'
  if (error.details && /codec|incompatible/i.test(error.details)) return 'unsupported_codec'
  return error.type === 'mediaError' ? 'unsupported_codec' : 'network_error'
}

export function hlsFailure(error: Parameters<typeof hlsFailureCode>[0] & {networkDetails?: unknown}) {
  const network = error.networkDetails as {getResponseHeader?: (name: string) => string | null; headers?: {get?: (name: string) => string | null}} | undefined
  const delay = network?.getResponseHeader?.('Retry-After') ?? network?.headers?.get?.('Retry-After')
  return {code: hlsFailureCode(error), retryAfter: sourceRetryAfter({retryAfter: delay})}
}

export async function attachWebVideo(
  video: HTMLVideoElement,
  source: Awaited<ReturnType<typeof prepareWebVideoPlayback>>,
  isStale: () => boolean,
  onError: (error: {code: string; retryAfter?: number}) => void,
  startTime = 0,
) {
  video.crossOrigin = 'anonymous'
  if (source.kind === 'mp4' || video.canPlayType('application/vnd.apple.mpegurl')) {
    if (!isStale()) video.src = source.url
    return
  }
  const {default: Hls} = await import('hls.js')
  if (isStale()) return
  if (!Hls.isSupported()) throw Object.assign(new Error('Unsupported playback'), {code: 'unsupported_codec'})
  disposeWebVideo(video)
  const hls = new Hls({
    maxBufferLength: 30, maxMaxBufferLength: 60, maxBufferSize: 30 * 1024 * 1024,
    backBufferLength: 30, startPosition: startTime,
  })
  let manifestReady = false
  players.set(video, hls)
  hls.on(Hls.Events.ERROR, (_event, error) => {
    if (!error.fatal || isStale() || !manifestReady) return
    onError(hlsFailure(error))
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
    const onFailure = (_event: string, error: {fatal: boolean; type?: string; details?: string; response?: {code?: number}; networkDetails?: unknown}) => {
      if (error.fatal) {
        finish(Object.assign(new Error('Stream failed'), hlsFailure(error)))
        disposeWebVideo(video)
      }
    }
    const timer = window.setTimeout(() => {
      finish(Object.assign(new Error('Stream timed out'), {code: 'network_error'}))
      disposeWebVideo(video)
    }, 30_000)
    hls.on(Hls.Events.MANIFEST_PARSED, onParsed)
    hls.on(Hls.Events.ERROR, onFailure)
    hls.on(Hls.Events.DESTROYING, onDestroyed)
    hls.loadSource(source.url)
    hls.attachMedia(video)
  })
}
