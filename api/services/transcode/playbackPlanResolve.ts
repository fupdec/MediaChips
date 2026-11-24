/** Pure playback-plan decisions after playability I/O is done. */

export type PlayabilityResult = {
  playable: boolean
  reason: string | null
  videoCodec: string | null
  audioCodec: string | null
  duration: number
  needsRemux?: boolean
  /** ffprobe format_name of the real container (may differ from the file extension). */
  container?: string | null
  /** Codecs are browser-native; only the container blocks playback, so stream-copy remux works. */
  remuxable?: boolean
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
 * Server codec/container lists are advisory. Only the playback client knows
 * which native decoders its browser and OS provide (notably HEVC and MKV).
 * Always expose the original; the client can request conversion after failure.
 */
export function resolvePlaybackPlanFromPlayability(input: {
  playability: PlayabilityResult
  transcodeEnabled: boolean
}): PlaybackPlan {
  const {playability, transcodeEnabled} = input

  return {
    mode: 'direct',
    transcodeRequired: false,
    transcodeEnabled,
    transcodeStatus: 'none',
    progress: 100,
    error: null,
    reason: playability.needsRemux ? 'container_layout' : playability.reason,
    playability,
    ...(playability.remuxable ? {remuxCopy: true} : {}),
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
  /** Container-only mismatch: codecs are browser-native, so copy is safe. */
  remuxable?: boolean
  streamStart: number
}): boolean {
  const codecsCopySafe = Boolean((input.playable || input.remuxable) && !input.needsRemux)
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
