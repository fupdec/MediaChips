import {describe, expect, it} from 'vitest'
import {
  folderIconMdi,
  isStrictChildPath,
  normalizeExcludedPathsClient,
} from './watchedFolderExcludes'

describe('watchedFolderExcludes client helpers', () => {
  it('accepts only strict children', () => {
    expect(isStrictChildPath('/media/lib', '/media/lib/tmp')).toBe(true)
    expect(isStrictChildPath('/media/lib', '/media/lib')).toBe(false)
    expect(isStrictChildPath('/media/lib', '/media/other')).toBe(false)
  })

  it('normalizes and dedupes excludes', () => {
    expect(normalizeExcludedPathsClient('/media/lib', [
      '/media/lib/tmp/',
      '/media/lib/TMP',
      '/outside',
    ])).toEqual(['/media/lib/tmp'])
  })

  it('builds mdi icon names', () => {
    expect(folderIconMdi('folder-star')).toBe('mdi-folder-star')
    expect(folderIconMdi('mdi-movie')).toBe('mdi-movie')
    expect(folderIconMdi(null)).toBe('mdi-folder-outline')
  })
})
