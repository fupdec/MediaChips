import {describe, expect, it, vi} from 'vitest'
import {
  clampSubtitleScale,
  cycleSubtitleTrack,
  formatSubtitleDelay,
  nextSubtitleTrackName,
  shiftSubtitleDelay,
  type SubtitleStoreLike,
} from './playerSubtitleActions'

const t = (key: string) => `<${key}>`
const tracks = [
  {name: 'M.srt', label: '', format: 'srt' as const},
  {name: 'M.en.srt', label: 'en', format: 'srt' as const},
]

function createStore(overrides: Partial<SubtitleStoreLike> = {}): SubtitleStoreLike {
  return {subtitleTracks: tracks, subtitleTrackName: null, subtitleDelay: 0, changePlayerStatusText: vi.fn(), ...overrides}
}

describe('playerSubtitleActions', () => {
  it('cycles off → tracks → off', () => {
    expect(nextSubtitleTrackName(tracks, null)).toBe('M.srt')
    expect(nextSubtitleTrackName(tracks, 'M.srt')).toBe('M.en.srt')
    expect(nextSubtitleTrackName(tracks, 'M.en.srt')).toBeNull()
    expect(nextSubtitleTrackName([], null)).toBeNull()
  })

  it('reports the selected track, using the default label for an unnamed one', () => {
    const store = createStore()
    cycleSubtitleTrack(store, t)
    expect(store.subtitleTrackName).toBe('M.srt')
    expect(store.changePlayerStatusText).toHaveBeenCalledWith({
      text: '<player.subtitles_default>', icon: 'subtitles', subtitleKey: 'player.subtitles_label',
    })
    cycleSubtitleTrack(store, t)
    cycleSubtitleTrack(store, t)
    expect(store.subtitleTrackName).toBeNull()
    expect(store.changePlayerStatusText).toHaveBeenCalledWith({
      text: '<player.subtitles_off>', icon: 'subtitles-outline', subtitleKey: 'player.subtitles_label',
    })
  })

  it('says so when there are no subtitles', () => {
    const store = createStore({subtitleTracks: []})
    cycleSubtitleTrack(store, t)
    expect(store.subtitleTrackName).toBeNull()
    expect(store.changePlayerStatusText).toHaveBeenCalledWith({
      text: '<player.subtitles_none>', icon: 'subtitles-outline', subtitleKey: 'player.subtitles_label',
    })
  })

  it('shifts the delay in tenths and keeps it within ±10 s', () => {
    const store = createStore()
    shiftSubtitleDelay(store, 0.1)
    shiftSubtitleDelay(store, 0.1)
    shiftSubtitleDelay(store, 0.1)
    expect(store.subtitleDelay).toBe(0.3)
    store.subtitleDelay = 9.95
    shiftSubtitleDelay(store, 0.1)
    expect(store.subtitleDelay).toBe(10)
    shiftSubtitleDelay(store, 0.1)
    expect(store.subtitleDelay).toBe(10)
  })

  it('formats the delay and clamps the scale', () => {
    expect(formatSubtitleDelay(0.3)).toBe('+0.3 s')
    expect(formatSubtitleDelay(-1.3)).toBe('-1.3 s')
    expect(formatSubtitleDelay(-0)).toBe('0.0 s')
    expect(clampSubtitleScale(9)).toBe(3)
    expect(clampSubtitleScale(0.1)).toBe(0.5)
    expect(clampSubtitleScale(Number.NaN)).toBe(1)
  })
})
