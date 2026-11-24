import type {NativeTrack} from '@/services/nativePlayer'

/** Audio tracks are only worth a menu when there is a choice; subtitles when there is any track. */
export function audioTracksOf(tracks: readonly NativeTrack[]): NativeTrack[] {
  return tracks.filter(track => track.type === 'audio')
}

export function subtitleTracksOf(tracks: readonly NativeTrack[]): NativeTrack[] {
  return tracks.filter(track => track.type === 'sub')
}

/** "English · Commentary (ac3)" / "Track 2 (aac)"; falls back to the track number. */
export function trackLabel(track: NativeTrack, fallback: (id: number) => string): string {
  const name = [track.lang, track.title].map(part => part.trim()).filter(Boolean).join(' · ')
  const base = name || fallback(track.id)
  return track.codec ? `${base} (${track.codec})` : base
}
