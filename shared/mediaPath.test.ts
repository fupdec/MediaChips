import { describe, expect, it } from 'vitest'
import { mediaNameLooksLikePath, parseMediaFilePath } from './mediaPath'

describe('parseMediaFilePath', () => {
  it('parses POSIX paths', () => {
    expect(parseMediaFilePath('/Users/me/Videos/movie.mp4')).toEqual({
      path: '/Users/me/Videos/movie.mp4',
      basename: 'movie.mp4',
      name: 'movie',
      ext: '.mp4',
    })
  })

  it('parses Windows paths with backslashes', () => {
    expect(parseMediaFilePath('D:\\Videos\\folder\\movie.mp4')).toEqual({
      path: 'D:\\Videos\\folder\\movie.mp4',
      basename: 'movie.mp4',
      name: 'movie',
      ext: '.mp4',
    })
  })

  it('parses Windows paths with forward slashes', () => {
    expect(parseMediaFilePath('D:/Videos/folder/movie.mp4')).toEqual({
      path: 'D:/Videos/folder/movie.mp4',
      basename: 'movie.mp4',
      name: 'movie',
      ext: '.mp4',
    })
  })

  it('parses UNC paths', () => {
    expect(parseMediaFilePath('\\\\server\\share\\clip.mkv')).toEqual({
      path: '\\\\server\\share\\clip.mkv',
      basename: 'clip.mkv',
      name: 'clip',
      ext: '.mkv',
    })
  })

  it('handles files without extension', () => {
    expect(parseMediaFilePath('C:\\Videos\\rawfile')).toEqual({
      path: 'C:\\Videos\\rawfile',
      basename: 'rawfile',
      name: 'rawfile',
      ext: '',
    })
  })

  it('handles multi-dot filenames like Node path.parse', () => {
    expect(parseMediaFilePath('/tmp/archive.tar.gz')).toEqual({
      path: '/tmp/archive.tar.gz',
      basename: 'archive.tar.gz',
      name: 'archive.tar',
      ext: '.gz',
    })
  })
})

describe('mediaNameLooksLikePath', () => {
  it('detects separators in names', () => {
    expect(mediaNameLooksLikePath('D:\\Videos\\folder\\movie')).toBe(true)
    expect(mediaNameLooksLikePath('/Users/me/Videos/movie')).toBe(true)
    expect(mediaNameLooksLikePath('My Custom Title')).toBe(false)
    expect(mediaNameLooksLikePath('movie')).toBe(false)
  })
})
