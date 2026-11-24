import {isCloudMediaPath} from '@shared/cloudAccounts'
import {apiClient} from './apiClient'
import {isDriveMediaPath} from '@shared/cloudDrive'
import {isNasMediaPath} from '@shared/remoteMedia'

export function captureVideoFrame(video: HTMLVideoElement): string {
  if (video.readyState < 2 || video.seeking || !video.videoWidth || !video.videoHeight) {
    throw new Error('Wait until the video frame has loaded before saving it.')
  }
  const canvas = document.createElement('canvas')
  const scale = Math.min(1, 640 / video.videoWidth, 640 / video.videoHeight)
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Video frame capture is unavailable.')
  context.drawImage(video, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.85)
}

export function captureVideoFrameAt(src: string, time: number, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted()
    if (!Number.isFinite(time) || time < 0) {
      reject(new Error('Invalid video frame time.'))
      return
    }
    const video = document.createElement('video')
    const timeout = window.setTimeout(() => fail(), 8000)

    function cleanup() {
      window.clearTimeout(timeout)
      signal.removeEventListener('abort', fail)
      video.onloadedmetadata = video.onloadeddata = video.onseeked = video.onerror = null
      video.removeAttribute('src')
      video.load()
    }

    function fail() {
      cleanup()
      reject(new Error('Could not load the video frame.'))
    }

    function capture() {
      if (video.seeking || video.readyState < 2 || Math.abs(video.currentTime - time) > 0.05) return
      try {
        const frame = captureVideoFrame(video)
        cleanup()
        resolve(frame)
      } catch {
        fail()
      }
    }

    signal.addEventListener('abort', fail, {once: true})
    video.crossOrigin = 'anonymous'
    video.preload = 'auto'
    video.onloadedmetadata = () => {
      if (Number.isFinite(video.duration) && time > video.duration) {
        fail()
        return
      }
      try {
        video.currentTime = time
      } catch {
        fail()
      }
    }
    video.onloadeddata = video.onseeked = capture
    video.onerror = fail
    try {
      video.src = src
    } catch {
      fail()
    }
  })
}

/** Marker times are whole seconds (floored), so the playhead may sit up to one second past the marker. */
const FRAME_TOLERANCE_BEFORE = 0.35
const FRAME_TOLERANCE_AFTER = 1

const isNearTime = (video: HTMLVideoElement, time: number) => (
  video.currentTime >= time - FRAME_TOLERANCE_BEFORE && video.currentTime <= time + FRAME_TOLERANCE_AFTER
)

/** Seeks the live player to `time`, grabs the frame and puts the playhead back where it was. */
async function captureFrameAtTime(video: HTMLVideoElement, time: number): Promise<string | null> {
  if (!Number.isFinite(time) || time < 0 || video.readyState < 1 || !Number.isFinite(video.duration) || time > video.duration) return null
  const source = video.src
  let sourceChanged = false
  let seekChanged = false
  const ownsSource = () => !sourceChanged && video.src === source
  const previousTime = video.currentTime
  const wasPlaying = !video.paused && !video.ended
  if (wasPlaying) video.pause()
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => finish(new Error('Seek timed out.')), 8000)
      const finish = (error?: Error) => {
        window.clearTimeout(timeout)
        video.removeEventListener('seeked', onSeeked)
        video.removeEventListener('error', onError)
        video.removeEventListener('emptied', onSourceChange)
        video.removeEventListener('loadstart', onSourceChange)
        if (error) reject(error)
        else resolve()
      }
      const onSeeked = () => {
        if (!ownsSource()) finish(new Error('Video source changed.'))
        else if (!video.seeking && video.readyState >= 2) {
          if (Math.abs(video.currentTime - time) > 0.05) {
            seekChanged = true
            finish(new Error('Video position changed.'))
          } else finish()
        }
      }
      const onSourceChange = () => { sourceChanged = true; finish(new Error('Video source changed.')) }
      const onError = () => finish(new Error('Seek failed.'))
      video.addEventListener('seeked', onSeeked)
      video.addEventListener('error', onError)
      video.addEventListener('emptied', onSourceChange)
      video.addEventListener('loadstart', onSourceChange)
      try {
        video.currentTime = time
      } catch (error) {
        finish(error instanceof Error ? error : new Error('Seek failed.'))
      }
    })
    if (!ownsSource()) return null
    if (video.seeking || Math.abs(video.currentTime - time) > 0.05) {
      seekChanged = true
      return null
    }
    return captureVideoFrame(video)
  } catch {
    return null
  } finally {
    if (ownsSource() && !seekChanged) {
      video.currentTime = previousTime
      if (wasPlaying) void video.play().catch(() => {})
    }
  }
}

export async function saveWebVideoCurrentFrame({video, mediaId, markId, expectedTime, mediaPath}: {
  video: HTMLVideoElement | null; mediaId: number; markId?: number; expectedTime?: number; mediaPath?: string
}): Promise<boolean> {
  if (!video || video.seeking || video.readyState < 2) return false
  if (expectedTime != null && (!Number.isFinite(expectedTime) || expectedTime < 0)) return false
  let image: string | null
  if (expectedTime == null || isNearTime(video, expectedTime)) {
    image = captureVideoFrame(video)
  } else {
    // The playhead is elsewhere (edited marker time, drag, long dialog): take the frame at the marker itself.
    image = await captureFrameAtTime(video, expectedTime)
    if (!image) return false
  }
  const route = isCloudMediaPath(mediaPath) ? `/api/cloud-accounts/media/${mediaId}/frame` : isDriveMediaPath(mediaPath) ? `/api/drive/media/${mediaId}/frame` : isNasMediaPath(mediaPath) ? `/api/nas/media/${mediaId}/frame` : `/api/web-video/${mediaId}/frame`
  await apiClient.post(route, {image, target: markId == null ? 'poster' : 'mark', markId})
  return true
}
