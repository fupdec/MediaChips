import {describe, expect, it} from 'vitest'
import {parseAudioId3Tags, pickFfprobeTag} from './audioId3Tags'

describe('audioId3Tags', () => {
  it('picks tags case-insensitively', () => {
    expect(pickFfprobeTag({Title: ' Hello '}, ['title'])).toBe('Hello')
    expect(pickFfprobeTag({ARTIST: 'A'}, ['artist'])).toBe('A')
    expect(pickFfprobeTag({}, ['title'])).toBeNull()
  })

  it('parses common ID3 fields', () => {
    expect(parseAudioId3Tags({
      title: 'Song',
      album_artist: 'Band',
      album: 'LP',
    })).toEqual({
      title: 'Song',
      artist: 'Band',
      album: 'LP',
    })
  })
})
