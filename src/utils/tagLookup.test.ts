import {describe, expect, it} from 'vitest'
import {findTagByNameOrSynonym, tagMatchesLookupName} from './tagLookup'
import type {Tag} from '@/types/stores'

describe('tagLookup', () => {
  const tags = [
    {id: 1, name: 'Alice', metaId: 10, synonyms: 'Al, Ally'} as Tag,
  ]

  it('matches primary name and synonyms', () => {
    expect(tagMatchesLookupName(tags[0], 'alice')).toBe(true)
    expect(tagMatchesLookupName(tags[0], 'Ally')).toBe(true)
    expect(tagMatchesLookupName(tags[0], 'bob')).toBe(false)
  })

  it('finds by name within meta', () => {
    expect(findTagByNameOrSynonym(10, 'Al', tags)?.id).toBe(1)
    expect(findTagByNameOrSynonym(11, 'Al', tags)).toBeUndefined()
  })
})
