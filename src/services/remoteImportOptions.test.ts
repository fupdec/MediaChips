import {describe, expect, it} from 'vitest'
import {defaultRemoteImportOptions, remotePathExcluder, importExtensionMatcher} from './remoteImportOptions'

describe('remote import exclusions', () => {
  it('defaults to parsing tags with no exclusions', () => {
    const options = defaultRemoteImportOptions()
    expect(options.parseTags).toBe(true)
    expect(remotePathExcluder(options)('/Кино/clip.mp4')).toBe(false)
  })

  it('accepts pasted paths and fragments, one per line, just like local imports', () => {
    const excludes = remotePathExcluder({parseTags: true,
      excluded: '  "/Кино/Пропустить"\r\n\n \'trailer\' \n'})
    expect(excludes('/Кино/Пропустить/nested/clip.mp4')).toBe(true)
    expect(excludes('/Кино/movie-trailer.mp4')).toBe(true)
    expect(excludes('/Кино/Хорошее/clip.mp4')).toBe(false)
  })
})

describe('shared import media type filter', () => {
  it('matches configured extensions independently of case and distinguishes empty and omitted filters', () => {
    const matches = importExtensionMatcher('mp4, .JPG, flac')
    expect(['Movie.MP4', 'Photo.jpg', '/folder/Music.FLAC'].every(matches)).toBe(true)
    expect(['Movie.mkv', '/folder.mp4/notes', 'notes'].some(matches)).toBe(false)
    expect(importExtensionMatcher('')('Movie.mp4')).toBe(false)
    expect(importExtensionMatcher()('Movie.mp4')).toBe(true)
  })
})
