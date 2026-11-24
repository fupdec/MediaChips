import path from 'path'

const DIRECT_VIDEO_CONTAINERS = new Set(['.mp4', '.m4v', '.webm'])
const DIRECT_AUDIO_CONTAINERS = new Set(['.mp3', '.m4a', '.aac', '.ogg', '.opus', '.webm', '.wav', '.flac'])
const BROWSER_VIDEO_CODECS = new Set(['h264', 'av1', 'vp8', 'vp9'])
const BROWSER_AUDIO_CODECS = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac', 'pcm_s16le', 'pcm_s24le'])

interface ProbeStream {
  codec_type?: string
  codec_name?: string
}

function getPrimaryStream(streams: ProbeStream[] | undefined, type: string) {
  return (streams || []).find((stream) => stream.codec_type === type) || null
}

function analyzeProbeResult(
  probe: {streams?: ProbeStream[]} | null | undefined,
  filePath: string,
  options: {audioOnly?: boolean} = {},
) {
  const {audioOnly = false} = options
  const streams = probe?.streams || []
  const extension = path.extname(filePath || '').toLowerCase()
  const videoStream = getPrimaryStream(streams, 'video')
  const audioStream = getPrimaryStream(streams, 'audio')

  if (audioOnly || (!videoStream && audioStream)) {
    if (!DIRECT_AUDIO_CONTAINERS.has(extension)) {
      return {playable: false, reason: 'container', videoCodec: null, audioCodec: audioStream?.codec_name || null}
    }

    if (audioStream?.codec_name && !BROWSER_AUDIO_CODECS.has(audioStream.codec_name)) {
      return {
        playable: false,
        reason: 'audio_codec',
        videoCodec: null,
        audioCodec: audioStream.codec_name,
      }
    }

    return {
      playable: true,
      reason: null,
      videoCodec: null,
      audioCodec: audioStream?.codec_name || null,
    }
  }

  if (!videoStream) {
    return {playable: false, reason: 'no_video_stream', videoCodec: null, audioCodec: audioStream?.codec_name || null}
  }

  if (!DIRECT_VIDEO_CONTAINERS.has(extension)) {
    return {
      playable: false,
      reason: 'container',
      videoCodec: videoStream.codec_name,
      audioCodec: audioStream?.codec_name || null,
    }
  }

  if (videoStream.codec_name && !BROWSER_VIDEO_CODECS.has(videoStream.codec_name)) {
    return {
      playable: false,
      reason: 'video_codec',
      videoCodec: videoStream.codec_name,
      audioCodec: audioStream?.codec_name || null,
    }
  }

  if (audioStream?.codec_name && !BROWSER_AUDIO_CODECS.has(audioStream.codec_name)) {
    return {
      playable: false,
      reason: 'audio_codec',
      videoCodec: videoStream.codec_name,
      audioCodec: audioStream.codec_name,
    }
  }

  return {
    playable: true,
    reason: null,
    videoCodec: videoStream.codec_name,
    audioCodec: audioStream?.codec_name || null,
  }
}

/**
 * Codecs Chromium decodes natively, so only the container is in the way and a
 * stream-copy remux (no re-encode) is enough. A missing stream counts as fine.
 */
function areCodecsBrowserCompatible(videoCodec: string | null | undefined, audioCodec: string | null | undefined): boolean {
  return (!videoCodec || BROWSER_VIDEO_CODECS.has(videoCodec))
    && (!audioCodec || BROWSER_AUDIO_CODECS.has(audioCodec))
}

export {
  areCodecsBrowserCompatible,
  DIRECT_VIDEO_CONTAINERS,
  DIRECT_AUDIO_CONTAINERS,
  BROWSER_VIDEO_CODECS,
  BROWSER_AUDIO_CODECS,
  analyzeProbeResult,
}

