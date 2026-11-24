/** Probe the audio track separately: a browser may play video while dropping audio. */
export function hasUnsupportedBrowserAudio(
  media: Pick<HTMLMediaElement, 'canPlayType'>,
  codec: string | null | undefined,
): boolean {
  const types: Record<string, string[]> = {
    aac: ['audio/mp4; codecs="mp4a.40.2"'],
    mp3: ['audio/mpeg'],
    opus: ['audio/webm; codecs="opus"', 'audio/ogg; codecs="opus"'],
    vorbis: ['audio/webm; codecs="vorbis"', 'audio/ogg; codecs="vorbis"'],
    flac: ['audio/flac'],
    ac3: ['audio/mp4; codecs="ac-3"'],
    eac3: ['audio/mp4; codecs="ec-3"'],
    dts: ['audio/vnd.dts'],
    truehd: ['audio/true-hd'],
    pcm_s16le: ['audio/wav; codecs="1"'],
    pcm_s24le: ['audio/wav; codecs="1"'],
  }
  const candidates = codec ? types[codec] : undefined
  // Unknown / incomplete probe results must not prevent a native playback attempt.
  return Boolean(candidates?.length && candidates.every(type => !media.canPlayType(type)))
}

/** ffprobe format_name token -> MIME type to ask canPlayType about. */
const CONTAINER_MIME_TYPES: Array<[token: string, mime: string]> = [
  ['mp4', 'video/mp4'],
  ['mov', 'video/mp4'],
  ['matroska', 'video/x-matroska'],
  ['mpegts', 'video/mp2t'],
  ['avi', 'video/x-msvideo'],
  ['flv', 'video/x-flv'],
  ['asf', 'video/x-ms-asf'],
  ['ogg', 'video/ogg'],
  ['mpeg', 'video/mpeg'],
]

/**
 * True only when the browser positively cannot open this container (e.g. MPEG-TS, AVI).
 * Unknown containers return false so a native attempt is never blocked by missing data.
 */
export function hasUnsupportedBrowserContainer(
  media: Pick<HTMLMediaElement, 'canPlayType'>,
  container: string | null | undefined,
): boolean {
  if (!container) return false
  const tokens = container.split(',').map(token => token.trim())
  const match = CONTAINER_MIME_TYPES.find(([token]) => tokens.includes(token))
  return Boolean(match && !media.canPlayType(match[1]))
}
