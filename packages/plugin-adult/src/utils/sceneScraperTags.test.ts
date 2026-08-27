import { describe, expect, it, vi } from 'vitest'
import {
  buildScrapedTagEntries,
  findOrCreateTagByName,
  findTagByNameOrSynonym,
  findTagByNameOrSynonymAnyCategory,
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

  it('treats tags as existing/assigned even when tag.metaId differs from the field', () => {
    const mismatched: Tag[] = [
      {
        id: 7,
        metaId: 99,
        name: 'Big Butts Like It Big',
        synonyms: undefined,
      },
    ]

    const entries = buildScrapedTagEntries({
      scrapedNames: ['Big Butts Like It Big'],
      metaId: 20,
      assignedTagIds: [7],
      tags: mismatched,
    })

    expect(findTagByNameOrSynonym(20, 'Big Butts Like It Big', mismatched)).toBeUndefined()
    expect(findTagByNameOrSynonymAnyCategory('Big Butts Like It Big', mismatched)?.id).toBe(7)
    expect(entries[0]).toMatchObject({
      exists: true,
      alreadyAssigned: true,
    })
  })

  it('reuses a newly created tag from the shared allTags list on later lookups', async () => {
    const allTags: Tag[] = []
    const createTags = vi.fn(async () => ({
      data: [{ id: 42, name: 'Jia Lissa' }],
    }))

    const firstId = await findOrCreateTagByName('Jia Lissa', 10, allTags, createTags)
    const secondId = await findOrCreateTagByName('jia lissa', 10, allTags, createTags)

    expect(firstId).toBe(42)
    expect(secondId).toBe(42)
    expect(createTags).toHaveBeenCalledTimes(1)
    expect(createTags).toHaveBeenCalledWith(
      [{ name: 'Jia Lissa', metaId: 10 }],
      { onTrashNameConflict: 'create' },
    )
    expect(allTags).toHaveLength(1)
    expect(allTags[0]).toMatchObject({ id: 42, name: 'Jia Lissa', metaId: 10 })
  })

  it('reuses a globally existing tag instead of creating a duplicate', async () => {
    const allTags: Tag[] = [
      {
        id: 7,
        metaId: 99,
        name: 'Big Butts Like It Big',
        synonyms: undefined,
      },
    ]
    const createTags = vi.fn(async () => ({
      data: [{ id: 100, name: 'Big Butts Like It Big' }],
    }))

    const id = await findOrCreateTagByName('Big Butts Like It Big', 20, allTags, createTags)

    expect(id).toBe(7)
    expect(createTags).not.toHaveBeenCalled()
  })

  it('recovers from name_conflict by reusing conflictingTagId', async () => {
    const allTags: Tag[] = []
    const createTags = vi.fn(async () => {
      const error = Object.assign(new Error('Tag name already exists'), {
        response: {
          status: 409,
          data: { code: 'name_conflict', conflictingTagId: 55 },
        },
      })
      throw error
    })

    const id = await findOrCreateTagByName('Wife', 10, allTags, createTags)

    expect(id).toBe(55)
    expect(allTags).toHaveLength(1)
    expect(allTags[0]).toMatchObject({ id: 55, name: 'Wife', metaId: 10 })
  })
})
