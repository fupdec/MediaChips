import type {SubtitleTrack} from '@shared/subtitles'

export type Translate = (key: string) => string

/** The part of the player store that subtitle hotkeys read and write. */
export interface SubtitleStoreLike {
  subtitleTracks: SubtitleTrack[]
  /** File name of the shown track, null = subtitles off. */
  subtitleTrackName: string | null
  /** Seconds; positive shows the subtitles later. */
  subtitleDelay: number
  changePlayerStatusText?: (payload: { text: string; icon: string; subtitleKey?: string | null }) => void
}

export const SUBTITLE_DELAY_LIMIT = 10
export const SUBTITLE_DELAY_STEP = 0.1
export const SUBTITLE_SCALE_MIN = 0.5
export const SUBTITLE_SCALE_MAX = 3

export function clampSubtitleScale(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(SUBTITLE_SCALE_MAX, Math.max(SUBTITLE_SCALE_MIN, value))
}

export function subtitleTrackLabel(track: SubtitleTrack, t: Translate): string {
  return track.label || t('player.subtitles_default')
}

export function formatSubtitleDelay(delay: number): string {
  const rounded = Math.round(delay * 10) / 10 + 0 // "+ 0" turns -0 into 0
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)} s`
}

/** Off → first track → … → last track → off. */
export function nextSubtitleTrackName(tracks: readonly SubtitleTrack[], current: string | null): string | null {
  if (tracks.length === 0) return null
  if (current == null) return tracks[0].name
  const index = tracks.findIndex(track => track.name === current)
  return index >= 0 && index + 1 < tracks.length ? tracks[index + 1].name : null
}

export function cycleSubtitleTrack(store: SubtitleStoreLike, t: Translate): void {
  const subtitleKey = 'player.subtitles_label'
  if (store.subtitleTracks.length === 0) {
    store.changePlayerStatusText?.({text: t('player.subtitles_none'), icon: 'subtitles-outline', subtitleKey})
    return
  }
  const name = nextSubtitleTrackName(store.subtitleTracks, store.subtitleTrackName)
  store.subtitleTrackName = name
  const track = store.subtitleTracks.find(item => item.name === name)
  store.changePlayerStatusText?.({
    text: track ? subtitleTrackLabel(track, t) : t('player.subtitles_off'),
    icon: track ? 'subtitles' : 'subtitles-outline',
    subtitleKey,
  })
}

export function shiftSubtitleDelay(store: SubtitleStoreLike, delta: number): void {
  const next = Math.round((store.subtitleDelay + delta) * 10) / 10
  store.subtitleDelay = Math.min(SUBTITLE_DELAY_LIMIT, Math.max(-SUBTITLE_DELAY_LIMIT, next))
  store.changePlayerStatusText?.({
    text: formatSubtitleDelay(store.subtitleDelay),
    icon: 'subtitles',
    subtitleKey: 'player.subtitles_delay',
  })
}
