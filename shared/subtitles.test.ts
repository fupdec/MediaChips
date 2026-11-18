import {describe, expect, it} from 'vitest'
import {matchSubtitleFileName, sortSubtitleTracks} from './subtitles'

describe('subtitles shared', () => {
  it('matches sidecar names next to the video', () => {
    expect(matchSubtitleFileName('Movie', 'Movie.srt')).toEqual({name: 'Movie.srt', label: '', format: 'srt'})
    expect(matchSubtitleFileName('Movie', 'movie.EN.VTT')).toEqual({name: 'movie.EN.VTT', label: 'EN', format: 'vtt'})
    expect(matchSubtitleFileName('Movie', 'Movie.ru.forced.srt')).toEqual({name: 'Movie.ru.forced.srt', label: 'ru.forced', format: 'srt'})
  })

  it('ignores other files', () => {
    expect(matchSubtitleFileName('Movie', 'Movie.mkv')).toBeNull()
    expect(matchSubtitleFileName('Movie', 'Movie 2.srt')).toBeNull()
    expect(matchSubtitleFileName('Movie', 'Movies.srt')).toBeNull()
    expect(matchSubtitleFileName('Movie', 'Other.srt')).toBeNull()
    expect(matchSubtitleFileName('Movie', '.srt')).toBeNull()
  })

  it('puts the exactly named file first', () => {
    const tracks = [
      {name: 'M.ru.srt', label: 'ru', format: 'srt' as const},
      {name: 'M.srt', label: '', format: 'srt' as const},
      {name: 'M.en.srt', label: 'en', format: 'srt' as const},
    ]
    expect(sortSubtitleTracks(tracks).map(track => track.name)).toEqual(['M.srt', 'M.en.srt', 'M.ru.srt'])
  })
})
