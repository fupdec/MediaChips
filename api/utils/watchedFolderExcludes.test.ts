import {describe, expect, it} from 'vitest'
import {
  isPathUnderExcluded,
  normalizeExcludedPaths,
  parseExcludedPathsJson,
  serializeExcludedPaths,
} from './watchedFolderExcludes'

describe('normalizeExcludedPaths', () => {
  const root = '/media/library'

  it('keeps children of the root', () => {
    expect(normalizeExcludedPaths(root, [
      '/media/library/tmp',
      '/media/library/cache/old',
    ])).toEqual([
      '/media/library/tmp',
      '/media/library/cache/old',
    ])
  })

  it('drops the root itself and outside paths', () => {
    expect(normalizeExcludedPaths(root, [
      '/media/library',
      '/elsewhere/tmp',
      '/media/other',
    ])).toEqual([])
  })

  it('dedupes case-insensitively and normalizes', () => {
    expect(normalizeExcludedPaths(root, [
      '/media/library/tmp/',
      '/media/library/TMP',
      '  /media/library/tmp  ',
    ])).toHaveLength(1)
  })
})

describe('parseExcludedPathsJson / serializeExcludedPaths', () => {
  it('round-trips arrays', () => {
    const paths = ['/a/b', '/a/c']
    expect(parseExcludedPathsJson(serializeExcludedPaths(paths))).toEqual(paths)
  })

  it('returns empty for invalid json', () => {
    expect(parseExcludedPathsJson('{nope}')).toEqual([])
    expect(parseExcludedPathsJson(null)).toEqual([])
  })
})

describe('isPathUnderExcluded', () => {
  it('matches the exclude path and nested files', () => {
    const excluded = ['/media/library/tmp']
    expect(isPathUnderExcluded('/media/library/tmp', excluded)).toBe(true)
    expect(isPathUnderExcluded('/media/library/tmp/a.mp4', excluded)).toBe(true)
    expect(isPathUnderExcluded('/media/library/keep/a.mp4', excluded)).toBe(false)
  })
})
