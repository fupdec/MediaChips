import {describe, expect, it} from 'vitest'
import {
  compactTagLookupName,
  getTagLookupNames,
  getTagLookupTerms,
  normalizeTagLookupName,
  tagMatchesLookupName,
} from './tagLookupName'

describe('tagLookupName', () => {
  it('normalizes and compacts names', () => {
    expect(normalizeTagLookupName('  Alice ')).toBe('alice')
    expect(compactTagLookupName('Studio Name')).toBe('studioname')
  })

  it('collects unique lookup names and ordered terms', () => {
    const tag = {name: 'StudioName', synonyms: 'Studio Name, SN, studio name'}
    expect(getTagLookupNames(tag)).toEqual(['studioname', 'studio name', 'sn'])
    expect(getTagLookupTerms(tag)).toEqual(['studioname', 'studio name', 'sn', 'studio name'])
  })

  it('matches with optional compact equality', () => {
    const tag = {name: 'StudioName', synonyms: null}
    expect(tagMatchesLookupName(tag, 'studioname')).toBe(true)
    expect(tagMatchesLookupName(tag, 'Studio Name')).toBe(true)
    expect(tagMatchesLookupName(tag, 'Studio Name', {compact: false})).toBe(false)
    expect(tagMatchesLookupName(tag, 'other')).toBe(false)
  })
})
