const LIVE_TRANSCODE_SESSION_KEY = 'mcLiveTranscodeMediaId'

export function markLiveTranscodeSession(mediaId: number | string | null | undefined): void {
  if (mediaId == null || mediaId === '') return

  try {
    sessionStorage.setItem(LIVE_TRANSCODE_SESSION_KEY, String(mediaId))
  } catch {
    // ignore storage errors
  }
}

export function clearLiveTranscodeSessionMark(): void {
  try {
    sessionStorage.removeItem(LIVE_TRANSCODE_SESSION_KEY)
  } catch {
    // ignore storage errors
  }
}

export function getMarkedLiveTranscodeMediaId(): string | null {
  try {
    return sessionStorage.getItem(LIVE_TRANSCODE_SESSION_KEY)
  } catch {
    return null
  }
}

export function abortVideoPlayback(
  videoEl: HTMLVideoElement | null | undefined,
  {preserveFrame = false}: {preserveFrame?: boolean} = {},
): void {
  if (!videoEl) return

  try {
    videoEl.pause()
  } catch {
    // ignore
  }

  if (preserveFrame) {
    try {
      const width = videoEl.videoWidth
      const height = videoEl.videoHeight
      if (width > 0 && height > 0) {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(videoEl, 0, 0, width, height)
          // Keep the last decoded frame painted while the thumb crossfades in;
          // clearing src without a poster flashes the gray card underlay.
          videoEl.poster = canvas.toDataURL('image/jpeg', 0.85)
        }
      }
    } catch {
      // ignore capture failures — still drop the network below
    }
  } else {
    try {
      videoEl.removeAttribute('poster')
    } catch {
      // ignore
    }
  }

  try {
    videoEl.removeAttribute('src')
    videoEl.load()
  } catch {
    // ignore
  }
}

export function stopLiveTranscodeRequest(
  stopUrl: string | null | undefined,
  { keepalive = false }: { keepalive?: boolean } = {},
): Promise<void> {
  if (!stopUrl) return Promise.resolve()

  return fetch(stopUrl, {
    method: 'DELETE',
    keepalive,
  }).catch(() => {}) as Promise<void>
}

export function stopAllLiveTranscodeStreams(
  stopAllUrl: string | null | undefined,
  { keepalive = false }: { keepalive?: boolean } = {},
): Promise<void> {
  if (!stopAllUrl) return Promise.resolve()

  return fetch(stopAllUrl, {
    method: 'DELETE',
    keepalive,
  }).catch(() => {}) as Promise<void>
}

export async function cleanupOrphanedLiveTranscode({
  buildStopUrl,
  stopAllUrl,
}: {
  buildStopUrl: (mediaId: number | string) => string
  stopAllUrl: string
}): Promise<void> {
  await stopAllLiveTranscodeStreams(stopAllUrl)

  const mediaId = getMarkedLiveTranscodeMediaId()
  if (!mediaId) return

  clearLiveTranscodeSessionMark()
  await stopLiveTranscodeRequest(buildStopUrl(mediaId))
}

export function installLiveTranscodeUnloadGuard({
  getMediaId,
  buildStopUrl,
  stopAllUrl,
  abortPlayback,
}: {
  getMediaId?: () => number | string | null
  buildStopUrl: (mediaId: number | string) => string
  stopAllUrl: string
  abortPlayback?: () => void
}): () => void {
  const handlePageHide = () => {
    const mediaId = getMediaId?.()

    abortPlayback?.()
    clearLiveTranscodeSessionMark()
    stopAllLiveTranscodeStreams(stopAllUrl, { keepalive: true })

    if (mediaId == null) return

    stopLiveTranscodeRequest(buildStopUrl(mediaId), { keepalive: true })
  }

  window.addEventListener('pagehide', handlePageHide)

  return () => {
    window.removeEventListener('pagehide', handlePageHide)
  }
}
