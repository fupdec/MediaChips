import { describe, expect, it } from 'vitest'
import {
  buildScrapedTagEntries,
  findTagByNameOrSynonym,
  tagMatchesLookupName,
} from './sceneScraperTags'
import type { Tag } from '@/types/stores'

const tags: Tag[] = [
  {
    id: 1,
    metaId: 10,
    name: 'Angela White',
    synonyms: 'Angela, AW',
  },
  {
    id: 2,
    metaId: 10,
    name: 'Blacked',
    synonyms: undefined,
  },
]

describe('sceneScraperTags', () => {
  it('matches tags by synonym case-insensitively', () => {
    expect(findTagByNameOrSynonym(10, 'angela', tags)?.id).toBe(1)
    expect(tagMatchesLookupName(tags[0], 'AW')).toBe(true)
  })

  it('marks scraped names as existing and already assigned via synonyms', () => {
    const entries = buildScrapedTagEntries({
      scrapedNames: ['Angela', 'Blacked', 'New Tag'],
      metaId: 10,
      assignedTagIds: [1],
      tags,
    })

    expect(entries[0]).toMatchObject({
      name: 'Angela',
      exists: true,
      alreadyAssigned: true,
    })
    expect(entries[1]).toMatchObject({
      name: 'Blacked',
      exists: true,
      alreadyAssigned: false,
    })
    expect(entries[2]).toMatchObject({
      name: 'New Tag',
      exists: false,
      alreadyAssigned: false,
    })
  })

  it('matches tags when only spacing differs', () => {
    const studioTags: Tag[] = [
      {
        id: 3,
        metaId: 20,
        name: 'BigNaturals',
        synonyms: undefined,
      },
    ]

    expect(findTagByNameOrSynonym(20, 'Big Naturals', studioTags)?.id).toBe(3)
    expect(tagMatchesLookupName(studioTags[0], 'big naturals')).toBe(true)

    const entries = buildScrapedTagEntries({
      scrapedNames: ['Big Naturals'],
      metaId: 20,
      assignedTagIds: [3],
      tags: studioTags,
    })

    expect(entries[0]).toMatchObject({
      name: 'Big Naturals',
      exists: true,
      alreadyAssigned: true,
    })
  })
})
