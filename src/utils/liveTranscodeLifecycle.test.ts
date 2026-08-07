import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  markLiveTranscodeSession,
  clearLiveTranscodeSessionMark,
  getMarkedLiveTranscodeMediaId,
  cleanupOrphanedLiveTranscode,
  installLiveTranscodeUnloadGuard,
  abortVideoPlayback,
} from '@/utils/liveTranscodeLifecycle'

describe('liveTranscodeLifecycle', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true })))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('marks and clears live transcode session in sessionStorage', () => {
    markLiveTranscodeSession(42)
    expect(getMarkedLiveTranscodeMediaId()).toBe('42')

    clearLiveTranscodeSessionMark()
    expect(getMarkedLiveTranscodeMediaId()).toBeNull()
  })

  it('aborts playback by clearing src without freezing a frame', () => {
    const video = document.createElement('video')
    video.poster = 'data:image/jpeg;base64,stale'
    video.src = 'http://local/clip.mp4'
    const pause = vi.spyOn(video, 'pause').mockImplementation(() => {})
    const load = vi.spyOn(video, 'load').mockImplementation(() => {})

    abortVideoPlayback(video)

    expect(pause).toHaveBeenCalled()
    expect(video.getAttribute('poster')).toBeNull()
    expect(video.getAttribute('src')).toBeNull()
    expect(load).toHaveBeenCalled()
  })

  it('stops orphaned session on startup cleanup', async () => {
    markLiveTranscodeSession(7)

    await cleanupOrphanedLiveTranscode({
      buildStopUrl: (mediaId) => `/api/video/${mediaId}/transcode/stream`,
      stopAllUrl: '/api/transcode/streams',
    })

    expect(fetch).toHaveBeenCalledWith('/api/transcode/streams', {
      method: 'DELETE',
      keepalive: false,
    })
    expect(fetch).toHaveBeenCalledWith('/api/video/7/transcode/stream', {
      method: 'DELETE',
      keepalive: false,
    })
    expect(getMarkedLiveTranscodeMediaId()).toBeNull()
  })

  it('sends keepalive stop request on pagehide', () => {
    markLiveTranscodeSession(9)
    const abortPlayback = vi.fn()

    const removeGuard = installLiveTranscodeUnloadGuard({
      getMediaId: () => getMarkedLiveTranscodeMediaId(),
      buildStopUrl: (mediaId) => `/api/video/${mediaId}/transcode/stream`,
      stopAllUrl: '/api/transcode/streams',
      abortPlayback,
    })

    window.dispatchEvent(new Event('pagehide'))

    expect(abortPlayback).toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledWith('/api/transcode/streams', {
      method: 'DELETE',
      keepalive: true,
    })
    expect(fetch).toHaveBeenCalledWith('/api/video/9/transcode/stream', {
      method: 'DELETE',
      keepalive: true,
    })
    expect(getMarkedLiveTranscodeMediaId()).toBeNull()

    removeGuard()
  })
})
