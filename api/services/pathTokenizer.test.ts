/**
 * @vitest-environment node
 */
import {describe, expect, it} from 'vitest'
import {
  cleanComparable,
  isNoiseToken,
  normalizeToken,
  splitSegment,
  tokenizeFilePath,
  tokenizeSegment,
} from './pathTokenizer'

describe('normalizeToken', () => {
  it('lowercases, strips accents and punctuation', () => {
    expect(normalizeToken('Café-Studio')).toBe('cafestudio')
    expect(normalizeToken('Алексёва')).toBe('алексева')
  })
})

describe('splitSegment', () => {
  it('splits camelCase, separators, and acronyms', () => {
    expect(splitSegment('AliceStudio')).toEqual(['Alice', 'Studio'])
    expect(splitSegment('XMLParser')).toEqual(['XML', 'Parser'])
    expect(splitSegment('foo_bar-baz.(qux)')).toEqual(['foo', 'bar', 'baz', 'qux'])
  })
})

describe('isNoiseToken', () => {
  it.each([
    ['2019'],
    ['1080p'],
    ['720p'],
    ['4k'],
    ['x264'],
    ['h265'],
    ['hevc'],
    ['mkv'],
    ['mp4'],
    ['jpg'],
    ['http'],
    ['the'],
    ['of'],
    ['ab'],
  ])('treats %s as noise with default minLength', (token) => {
    expect(isNoiseToken(token)).toBe(true)
  })

  it('keeps meaningful tokens', () => {
    expect(isNoiseToken('alice')).toBe(false)
    expect(isNoiseToken('studio')).toBe(false)
  })

  it('respects minLength override', () => {
    expect(isNoiseToken('ab', {minLength: 2})).toBe(false)
    expect(isNoiseToken('a', {minLength: 2})).toBe(true)
  })
})

describe('tokenizeSegment', () => {
  it('returns normalized non-noise tokens', () => {
    expect(tokenizeSegment('Alice_Studio.2019.1080p')).toEqual(['alice', 'studio'])
  })
})

describe('tokenizeFilePath', () => {
  it('tokenizes unix paths with folder/file weights', () => {
    const result = tokenizeFilePath('/Media/AliceStudio/clip_final.mp4')
    expect(result.folders).toEqual(['Media', 'AliceStudio'])
    expect(result.file).toBe('clip_final')
    expect(result.uniqueTokens).toEqual(expect.arrayContaining(['media', 'alice', 'studio', 'clip', 'final']))
    expect(result.tokens.filter((t) => t.source === 'folder').every((t) => t.weight === 1.5)).toBe(true)
    expect(result.tokens.filter((t) => t.source === 'file').every((t) => t.weight === 1)).toBe(true)
  })

  it('handles windows separators and strips extension', () => {
    const result = tokenizeFilePath('D:\\Videos\\Performers\\JaneDoe\\scene_01.mkv')
    expect(result.folders).toContain('JaneDoe')
    expect(result.file).toBe('scene_01')
    expect(result.uniqueTokens).toEqual(expect.arrayContaining(['jane', 'doe', 'scene']))
    expect(result.uniqueTokens).not.toContain('mkv')
  })

  it('drops codec/resolution/year noise from file names', () => {
    const result = tokenizeFilePath('/lib/Show.Name.2019.1080p.x264.mkv')
    expect(result.uniqueTokens).toEqual(expect.arrayContaining(['show', 'name', 'lib']))
    expect(result.uniqueTokens).not.toEqual(expect.arrayContaining(['2019', '1080p', 'x264', 'mkv']))
  })

  it('honors custom weights and minLength', () => {
    const result = tokenizeFilePath('/ab/cd/ef.mp4', {
      minLength: 2,
      folderWeight: 3,
      fileWeight: 2,
    })
    expect(result.uniqueTokens).toEqual(expect.arrayContaining(['ab', 'cd', 'ef']))
    expect(result.tokens.find((t) => t.token === 'ab')?.weight).toBe(3)
    expect(result.tokens.find((t) => t.token === 'ef')?.weight).toBe(2)
  })

  it('treats zip archive as folder and entry as file without leaking zip token', () => {
    const result = tokenizeFilePath('/media/Nature/album.zip!/nested/DSC_001.jpg')
    expect(result.folders).toEqual(['media', 'Nature', 'album', 'nested'])
    expect(result.file).toBe('DSC_001')
    expect(result.uniqueTokens).toEqual(expect.arrayContaining(['nature', 'album']))
    expect(result.uniqueTokens).not.toEqual(expect.arrayContaining(['zip']))
  })

  it('returns empty tokens for blank paths', () => {
    expect(tokenizeFilePath('')).toEqual({
      folders: [],
      file: '',
      tokens: [],
      uniqueTokens: [],
    })
  })
})

describe('cleanComparable', () => {
  it('strips punctuation for comparisons', () => {
    expect(cleanComparable('Hello, World!')).toBe('helloworld')
    expect(cleanComparable('A-B_C')).toBe('abc')
  })
})
