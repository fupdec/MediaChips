import {describe, expect, it, vi} from 'vitest'
import {
  findOrCreateTagByName,
  findTagByNameOrSynonym,
  findTagByNameOrSynonymAnyCategory,
  tagMatchesLookupName,
} from './tagLookup'
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

  it('finds by name across categories', () => {
    expect(findTagByNameOrSynonymAnyCategory('Ally', tags)?.id).toBe(1)
  })

  it('reuses a globally existing tag instead of creating a duplicate', async () => {
    const allTags = [
      {id: 7, name: 'Big Butts Like It Big', metaId: 99} as Tag,
    ]
    const createTags = vi.fn(async () => ({
      data: [{id: 100, name: 'Big Butts Like It Big'}],
    }))

    const id = await findOrCreateTagByName('Big Butts Like It Big', 20, allTags, createTags)
    expect(id).toBe(7)
    expect(createTags).not.toHaveBeenCalled()
  })
})
