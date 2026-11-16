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
