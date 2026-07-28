export interface TranscodePlayerState {
  active?: boolean
  playbackError?: boolean
  usesLiveTranscode?: boolean
  liveTranscodeStarted?: boolean
  isLiveStreamSeeking?: boolean
  isStreamWaiting?: boolean
  transcodeError?: string | null
  transcodeStatus?: string
}

export interface TranscodePlayerStatus {
  text: string
  icon: string
}

type TranslateFn = (key: string) => string

/** Preparing or buffering live transcode — show a centered spinner. */
export function isTranscodeBusy(state: TranscodePlayerState | null | undefined): boolean {
  if (!state?.active || state.playbackError || !state.usesLiveTranscode) return false
  if (state.transcodeStatus === 'error') return false
  return !state.liveTranscodeStarted || Boolean(state.isLiveStreamSeeking) || Boolean(state.isStreamWaiting)
}

export function getTranscodePlayerStatus(
  state: TranscodePlayerState | null | undefined,
  t: TranslateFn,
): TranscodePlayerStatus | null {
  if (!state?.active || state.playbackError) return null

  const {
    usesLiveTranscode,
    liveTranscodeStarted,
    isLiveStreamSeeking,
    isStreamWaiting,
    transcodeError,
    transcodeStatus,
  } = state

  if (transcodeStatus === 'error' && transcodeError) {
    return {
      text: `${t('player.transcode_error')}: ${transcodeError}`,
      icon: 'alert',
    }
  }

  if (!usesLiveTranscode) return null

  if (isLiveStreamSeeking || isStreamWaiting) {
    return {
      text: t('player.transcode_buffering'),
      icon: 'cached',
    }
  }

  if (!liveTranscodeStarted) {
    return {
      text: t('player.transcode_preparing'),
      icon: 'video',
    }
  }

  return null
}
