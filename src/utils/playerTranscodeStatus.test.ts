import { describe, it, expect } from 'vitest'
import { getTranscodePlayerStatus, isTranscodeBusy } from '@/utils/playerTranscodeStatus'

const t = (key: string) => key

const busyBase = {
  active: true,
  playbackError: false,
  usesLiveTranscode: true,
  liveTranscodeStarted: false,
  isLiveStreamSeeking: false,
  isStreamWaiting: false,
  transcodeStatus: 'stream',
  transcodeError: null,
}

describe('getTranscodePlayerStatus', () => {
  it('returns preparing state before live transcode starts', () => {
    expect(getTranscodePlayerStatus({
      ...busyBase,
    }, t)).toEqual({
      text: 'player.transcode_preparing',
      icon: 'video',
    })
  })

  it('returns buffering state during seek', () => {
    expect(getTranscodePlayerStatus({
      ...busyBase,
      liveTranscodeStarted: true,
      isLiveStreamSeeking: true,
    }, t)).toEqual({
      text: 'player.transcode_buffering',
      icon: 'cached',
    })
  })

  it('returns transcode error status when stream fails', () => {
    expect(getTranscodePlayerStatus({
      ...busyBase,
      transcodeStatus: 'error',
      transcodeError: 'ffmpeg exited',
    }, t)).toEqual({
      text: 'player.transcode_error: ffmpeg exited',
      icon: 'alert',
    })
  })

  it('returns buffering state while stream is waiting', () => {
    expect(getTranscodePlayerStatus({
      ...busyBase,
      liveTranscodeStarted: true,
      isStreamWaiting: true,
    }, t)).toEqual({
      text: 'player.transcode_buffering',
      icon: 'cached',
    })
  })
})

describe('isTranscodeBusy', () => {
  it('is true while preparing or buffering', () => {
    expect(isTranscodeBusy(busyBase)).toBe(true)
    expect(isTranscodeBusy({
      ...busyBase,
      liveTranscodeStarted: true,
      isLiveStreamSeeking: true,
    })).toBe(true)
    expect(isTranscodeBusy({
      ...busyBase,
      liveTranscodeStarted: true,
      isStreamWaiting: true,
    })).toBe(true)
  })

  it('is false once streaming or on error', () => {
    expect(isTranscodeBusy({
      ...busyBase,
      liveTranscodeStarted: true,
    })).toBe(false)
    expect(isTranscodeBusy({
      ...busyBase,
      transcodeStatus: 'error',
      transcodeError: 'ffmpeg exited',
    })).toBe(false)
    expect(isTranscodeBusy({
      ...busyBase,
      usesLiveTranscode: false,
    })).toBe(false)
  })
})
