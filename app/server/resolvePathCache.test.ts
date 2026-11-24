import {beforeEach, describe, expect, it} from 'vitest'
import {
  clearResolvedPathCache,
  getCachedResolvedPath,
  invalidateResolvedPath,
  setCachedResolvedPath,
} from './resolvePathCache'

beforeEach(() => clearResolvedPathCache())

describe('resolvePathCache', () => {
  it('stores and returns resolved paths', () => {
    setCachedResolvedPath('/a', '/real/a')
    expect(getCachedResolvedPath('/a')).toBe('/real/a')
    expect(getCachedResolvedPath('/missing')).toBeUndefined()
  })

  it('ignores empty keys and empty values', () => {
    setCachedResolvedPath('', '/real/a')
    setCachedResolvedPath('/a', '')
    expect(getCachedResolvedPath('')).toBeUndefined()
    expect(getCachedResolvedPath('/a')).toBeUndefined()
  })

  it('invalidates a single entry and clears everything', () => {
    setCachedResolvedPath('/a', '/real/a')
    setCachedResolvedPath('/b', '/real/b')
    invalidateResolvedPath('/a')
    expect(getCachedResolvedPath('/a')).toBeUndefined()
    expect(getCachedResolvedPath('/b')).toBe('/real/b')
    invalidateResolvedPath('')
    clearResolvedPathCache()
    expect(getCachedResolvedPath('/b')).toBeUndefined()
  })

  it('overwrites an existing key', () => {
    setCachedResolvedPath('/a', '/one')
    setCachedResolvedPath('/a', '/two')
    expect(getCachedResolvedPath('/a')).toBe('/two')
  })
})
