import {describe, expect, it} from 'vitest'
import {pathVariants} from './pathVariants'
import {
  buildPathLookupVariants,
  normalizeMediaPath,
  normalizeUserPath,
  pathsEquivalent,
} from './normalizeUserPath'

describe('pathVariants', () => {
  it('returns empty for blank input and NFC/NFD for unicode', () => {
    expect(pathVariants('')).toEqual([])
    const variants = pathVariants('café')
    expect(variants).toContain('café')
    expect(variants.length).toBeGreaterThanOrEqual(1)
  })
})

describe('normalizeUserPath', () => {
  it('strips matching quotes', () => {
    expect(normalizeUserPath(`'/Movies/a.mp4'`)).toBe('/Movies/a.mp4')
    expect(normalizeUserPath('"/Movies/a.mp4"')).toBe('/Movies/a.mp4')
    expect(normalizeUserPath(12)).toBe(12)
  })

  it('normalizes media paths and zip virtual separators', () => {
    expect(normalizeMediaPath('/Movies/../Shows/a.mp4')).toContain('Shows')
    const zip = normalizeMediaPath('/lib/album.zip!/folder/pic.jpg')
    expect(zip).toContain('.zip!/')
    expect(zip).toContain('pic.jpg')
  })

  it('compares equivalent paths and builds lookup variants', () => {
    expect(pathsEquivalent('/a/b', '/a/b')).toBe(true)
    expect(pathsEquivalent('/a/b', '/a/c')).toBe(false)
    const variants = buildPathLookupVariants('/Movies/a.mp4')
    expect(variants.some((v) => v.includes('Movies'))).toBe(true)
  })
})
