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

export function abortVideoPlayback(videoEl: HTMLVideoElement | null | undefined): void {
  if (!videoEl) return

  try {
    videoEl.pause()
  } catch {
    // ignore
  }

  try {
    videoEl.removeAttribute('poster')
    videoEl.removeAttribute('src')
    videoEl.load()
  } catch {
    // ignore
  }
}

/** Stop hover <video> and drop any in-memory poster/src before the next load. */
export function clearHoverPreviewSurface(videoEl: HTMLVideoElement | null | undefined): void {
  abortVideoPlayback(videoEl)
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
