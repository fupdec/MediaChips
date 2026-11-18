export type SubtitleFormat = 'srt' | 'vtt'

/** A subtitle file lying next to a local video. */
export interface SubtitleTrack {
  /** File name inside the video's folder; also the track identifier. */
  name: string
  /** What follows the video name, e.g. "en" for "Movie.en.srt"; empty for "Movie.srt". */
  label: string
  format: SubtitleFormat
}

export interface MediaSubtitleList {
  tracks: SubtitleTrack[]
}

export interface SubtitleFile {
  name: string
  format: SubtitleFormat
  text: string
}

export const SUBTITLE_FORMATS: Readonly<Record<string, SubtitleFormat>> = Object.freeze({
  '.srt': 'srt',
  '.vtt': 'vtt',
})
export const MAX_SUBTITLE_TRACKS = 20
export const MAX_SUBTITLE_BYTES = 5 * 1024 * 1024

/**
 * Matches "<video name>.srt" and "<video name>.<suffix>.srt|vtt" (case-insensitive),
 * the usual sidecar naming ("Movie.en.srt", "Movie.ru.forced.srt").
 */
export function matchSubtitleFileName(videoBaseName: string, fileName: string): SubtitleTrack | null {
  const dot = fileName.lastIndexOf('.')
  if (dot <= 0) return null
  const format = SUBTITLE_FORMATS[fileName.slice(dot).toLowerCase()]
  if (!format) return null
  const stem = fileName.slice(0, dot)
  const base = videoBaseName.toLowerCase()
  const lowerStem = stem.toLowerCase()
  if (lowerStem === base) return {name: fileName, label: '', format}
  if (lowerStem.startsWith(`${base}.`)) return {name: fileName, label: stem.slice(videoBaseName.length + 1), format}
  return null
}

/** The file named exactly like the video comes first, then by label. */
export function sortSubtitleTracks(tracks: SubtitleTrack[]): SubtitleTrack[] {
  return [...tracks].sort((a, b) => {
    if ((a.label === '') !== (b.label === '')) return a.label === '' ? -1 : 1
    return a.label.localeCompare(b.label) || a.name.localeCompare(b.name)
  })
}
