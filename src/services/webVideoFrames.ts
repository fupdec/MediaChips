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
    video.onloadedmetadata = () => { video.currentTime = time }
    video.onloadeddata = video.onseeked = capture
    video.onerror = fail
    video.src = src
  })
}

export async function saveWebVideoCurrentFrame({video, mediaId, markId, expectedTime, mediaPath}: {
  video: HTMLVideoElement | null; mediaId: number; markId?: number; expectedTime?: number; mediaPath?: string
}): Promise<boolean> {
  if (!video || video.seeking || video.readyState < 2) return false
  // A marker can be edited without moving the playhead. Never save the wrong frame.
  if (expectedTime != null && Math.abs(video.currentTime - expectedTime) > 0.35) return false
  const image = captureVideoFrame(video)
  const route = isCloudMediaPath(mediaPath) ? `/api/cloud-accounts/media/${mediaId}/frame` : isDriveMediaPath(mediaPath) ? `/api/drive/media/${mediaId}/frame` : isNasMediaPath(mediaPath) ? `/api/nas/media/${mediaId}/frame` : `/api/web-video/${mediaId}/frame`
  await apiClient.post(route, {image, target: markId == null ? 'poster' : 'mark', markId})
  return true
}
