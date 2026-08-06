/** Pure playback-plan decisions after playability I/O is done. */

export type PlayabilityResult = {
  playable: boolean
  reason: string | null
  videoCodec: string | null
  audioCodec: string | null
  duration: number
  needsRemux?: boolean
}

export type PlaybackPlan = {
  mode: string
  transcodeRequired: boolean
  transcodeEnabled?: boolean
  transcodeStatus: string
  progress: number
  error: string | null
  reason: string | null
  playability?: PlayabilityResult
  streamPlayback?: boolean
  remuxCopy?: boolean
}

export function buildMissingPlaybackPlan(): PlaybackPlan {
  return {
    mode: 'missing',
    transcodeRequired: false,
    transcodeStatus: 'none',
    progress: 100,
    error: 'File not found',
    reason: 'missing',
  }
}

/**
 * Choose missing/direct/stream/unsupported from analyzed playability.
 * Codec-compatible MP4s with bad layout still need live re-encode (not remux-copy).
 */
export function resolvePlaybackPlanFromPlayability(input: {
  playability: PlayabilityResult
  transcodeEnabled: boolean
}): PlaybackPlan {
  const {playability, transcodeEnabled} = input

  if (playability.playable && playability.needsRemux) {
    return {
      mode: 'stream',
      transcodeRequired: true,
      transcodeEnabled,
      transcodeStatus: 'stream',
      streamPlayback: true,
      remuxCopy: false,
      progress: 0,
      error: null,
      reason: 'container_layout',
      playability,
    }
  }

  if (playability.playable) {
    return {
      mode: 'direct',
      transcodeRequired: false,
      transcodeEnabled,
      transcodeStatus: 'none',
      progress: 100,
      error: null,
      reason: playability.reason,
      playability,
    }
  }

  if (!transcodeEnabled) {
    return {
      mode: 'unsupported',
      transcodeRequired: false,
      transcodeEnabled: false,
      transcodeStatus: 'disabled',
      progress: 100,
      error: null,
      reason: playability.reason,
      playability,
    }
  }

  return {
    mode: 'stream',
    transcodeRequired: true,
    transcodeStatus: 'stream',
    streamPlayback: true,
    progress: 0,
    error: null,
    reason: playability.reason,
    playability,
  }
}

/**
 * Whether the live ffmpeg pipe may stream-copy codecs.
 * Unsafe for pathological MP4 layouts and mid-file starts (keyframe-only cuts).
 */
export function resolveLiveStreamCopyCodecs(input: {
  requestedCopy: boolean
  playable: boolean
  needsRemux?: boolean
  streamStart: number
}): boolean {
  const codecsCopySafe = Boolean(input.playable && !input.needsRemux)
  return Boolean(input.requestedCopy)
    && codecsCopySafe
    && !input.needsRemux
    && input.streamStart < 0.05
}

/** Whether a lightweight ffprobe needs a full probe retry. */
export function isPlayabilityProbeIncomplete(
  probe: {streams?: Array<{codec_type?: string; codec_name?: string}>} | null | undefined,
  options: {audioOnly?: boolean} = {},
): boolean {
  const streams = probe?.streams || []
  if (streams.length === 0) return true

  if (options.audioOnly) {
    const audio = streams.find((stream) => stream.codec_type === 'audio')
    return !audio || !audio.codec_name
  }

  const video = streams.find((stream) => stream.codec_type === 'video')
  return !video || !video.codec_name
}
