import {describe, expect, it} from 'vitest'
import {
  buildExtensionRegex,
  buildExtensionRegexFromMediaTypes,
  fileMatchesExtensions,
  parseMediaExtensions,
} from './mediaExtensions'

describe('mediaExtensions', () => {
  it('parses extension lists and arrays', () => {
    expect(parseMediaExtensions('MP4, .mkv, avi')).toEqual(['mp4', 'mkv', 'avi'])
    expect(parseMediaExtensions(['.JPG', 'png'])).toEqual(['jpg', 'png'])
    expect(parseMediaExtensions('')).toEqual([])
  })

  it('builds extension regexes', () => {
    expect(buildExtensionRegex('mp4,mkv').test('/a/b.MP4')).toBe(true)
    expect(buildExtensionRegex('mp4').test('/a/b.txt')).toBe(false)
    expect(buildExtensionRegex('').test('/a/b.anything')).toBe(true)
    expect(buildExtensionRegexFromMediaTypes([
      {extensions: 'mp4'},
      {extensions: 'mkv,mp4'},
    ]).test('/x.mkv')).toBe(true)
  })

  it('matches file extensions', () => {
    expect(fileMatchesExtensions('/a/b.mp4', ['mp4', 'mkv'])).toBe(true)
    expect(fileMatchesExtensions('/a/b.txt', ['mp4'])).toBe(false)
    expect(fileMatchesExtensions('/a/b.mp4', [])).toBe(true)
  })
})
