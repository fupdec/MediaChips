import {sourceRetryAfter} from '@shared/sourceErrors'
import {parseCloudMediaPath, isCloudMediaPath} from '@shared/cloudAccounts'
import {apiClient, buildApiUrl} from './apiClient'
import {getAuthToken} from './authSession'
import {WebVideoPlayableSchema} from '@shared/webVideo'
import type Hls from 'hls.js'
import {isDriveMediaPath, parseDriveMediaPath} from '@shared/cloudDrive'
import {isNasMediaPath, parseNasMediaPath} from '@shared/remoteMedia'

// crypto.randomUUID is unavailable when the LAN renderer uses plain HTTP.
function createPlaybackTransferId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const transferIds = new WeakMap<HTMLVideoElement, string>()
const hlsSpeeds = new WeakMap<HTMLVideoElement, {speed: number; updated: number}>()
export function getRemotePlaybackTransfer(video: HTMLVideoElement) { return transferIds.get(video) }
export function getHlsDownloadSpeed(video: HTMLVideoElement) {
  const sample = hlsSpeeds.get(video)
  return sample && Date.now() - sample.updated < 4000 ? sample.speed : null
}

const players = new WeakMap<HTMLVideoElement, Hls>()

export function disposeWebVideo(video: HTMLVideoElement | null) {
  if (!video) return
  players.get(video)?.destroy()
  players.delete(video)
  transferIds.delete(video)
  hlsSpeeds.delete(video)
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

/**
 * Native mpv opens the same HTTP stream itself (Range, HLS and redirects are handled by libmpv),
 * so there is no hls.js or MediaSource involved. The transfer id still lets the speed
 * indicator find this playback.
 */
export function attachNativeWebVideo(video: HTMLVideoElement, source: {url: string; kind?: string}) {
  disposeWebVideo(video)
  const url = new URL(source.url, window.location.href)
  if (source.kind === 'mp4' && url.pathname.startsWith('/api/') && url.pathname.endsWith('/stream')) {
    const id = createPlaybackTransferId()
    transferIds.set(video, id)
    url.searchParams.set('playbackTransfer', id)
  }
  video.src = url.href
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
    if (!isStale()) {
      disposeWebVideo(video)
      const url = new URL(source.url, window.location.href)
      if (source.kind === 'mp4' && url.pathname.startsWith('/api/') && url.pathname.endsWith('/stream')) {
        const id = createPlaybackTransferId()
        transferIds.set(video, id)
        url.searchParams.set('playbackTransfer', id)
      }
      // Media fragment = the browser's own start position: applied as soon as the metadata
      // arrives, with no timeout to miss on a slow Drive/NAS stream.
      if (startTime > 0 && Number.isFinite(startTime)) url.hash = `t=${Math.floor(startTime * 1000) / 1000}`
      video.src = url.href
    }
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
  hls.on(Hls.Events.FRAG_LOADED, (_event, data) => {
    if (isStale()) return
    const elapsed = data.frag.stats.loading.end - data.frag.stats.loading.start
    if (elapsed > 0) hlsSpeeds.set(video, {speed: data.frag.stats.loaded * 1000 / elapsed, updated: Date.now()})
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
