/**
 * @vitest-environment node
 */
import {describe, expect, it} from 'vitest'
import {
  buildPathLookupVariants,
  isPathInsideFolder,
  normalizeMediaPath,
  normalizeUserPath,
  pathsEquivalent,
} from './normalizeUserPath'

describe('normalizeUserPath', () => {
  it.each([
    [null, null],
    [12, 12],
    ['  /a/b  ', '/a/b'],
    ["'/quoted/path'", '/quoted/path'],
    ['"/quoted/path"', '/quoted/path'],
    ['`/quoted/path`', '/quoted/path'],
    ['x', 'x'],
  ])('normalizes %j to %j', (input, expected) => {
    expect(normalizeUserPath(input)).toBe(expected)
  })
})

describe('normalizeMediaPath', () => {
  it('normalizes separators and NFC', () => {
    expect(normalizeMediaPath('/a/./b/../c')).toContain('c')
  })

  it('keeps zip virtual entries', () => {
    const result = normalizeMediaPath('/lib/album.zip!/nested\\photo.jpg')
    expect(result).toContain('!/')
    expect(result.endsWith('nested/photo.jpg')).toBe(true)
  })
})

describe('pathsEquivalent', () => {
  it('compares canonical and case-insensitive paths', () => {
    expect(pathsEquivalent('/A/b', '/a/b')).toBe(true)
    expect(pathsEquivalent('', '/a')).toBe(false)
    expect(pathsEquivalent('/a', '/b')).toBe(false)
  })
})

describe('buildPathLookupVariants', () => {
  it('returns slash variants for a path', () => {
    const variants = buildPathLookupVariants('/media/clip.mp4')
    expect(variants.length).toBeGreaterThan(0)
    expect(variants.some((v) => v.includes('clip.mp4'))).toBe(true)
  })
})

describe('isPathInsideFolder', () => {
  it('detects nested files and rejects the folder itself', () => {
    expect(isPathInsideFolder('/media/a/b.mp4', '/media/a')).toBe(true)
    expect(isPathInsideFolder('/media/a', '/media/a')).toBe(false)
    expect(isPathInsideFolder('/other/a.mp4', '/media')).toBe(false)
  })
})
