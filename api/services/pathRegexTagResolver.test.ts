/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'

import type { TagLike } from '../types/db'
import {
  findTagByNameOrSynonym,
  resolvePathRegexTagExtracts,
} from './pathRegexTagResolver'

describe('pathRegexTagResolver', () => {
  const tags: TagLike[] = [
    {id: 1, metaId: 10, name: 'StudioName', synonyms: 'Studio Name, SN'},
    {id: 2, metaId: 11, name: 'Season 1', synonyms: null},
  ]

  it('finds existing tag by name case-insensitively', () => {
    expect(findTagByNameOrSynonym(tags, 10, 'studioname')?.id).toBe(1)
  })

  it('finds existing tag by synonym', () => {
    expect(findTagByNameOrSynonym(tags, 10, 'Studio Name')?.id).toBe(1)
  })

  it('resolves existing without creating', () => {
    const mutable = [...tags]
    const resolved = resolvePathRegexTagExtracts(
      [{metaId: 10, tagName: 'SN', createTags: true, source: 'regex'}],
      mutable,
      {
        createTag: () => {
          throw new Error('should not create')
        },
      },
    )
    expect(resolved).toEqual([{
      tagId: 1,
      metaId: 10,
      tagName: 'StudioName',
      created: false,
    }])
    expect(mutable).toHaveLength(2)
  })

  it('creates when missing and createTags is on', () => {
    const mutable = [...tags]
    let nextId = 100
    const resolved = resolvePathRegexTagExtracts(
      [{metaId: 11, tagName: 'Season 2', createTags: true, source: 'regex'}],
      mutable,
      {
        createTag: (metaId, tagName) => {
          const created = {id: nextId++, metaId, name: tagName}
          return created
        },
      },
    )
    expect(resolved).toEqual([{
      tagId: 100,
      metaId: 11,
      tagName: 'Season 2',
      created: true,
    }])
    expect(mutable).toHaveLength(3)
  })

  it('skips when missing and createTags is off', () => {
    const mutable = [...tags]
    const resolved = resolvePathRegexTagExtracts(
      [{metaId: 11, tagName: 'Season 2', createTags: false, source: 'regex'}],
      mutable,
      {
        createTag: (metaId, tagName) => ({id: 999, metaId, name: tagName}),
      },
    )
    expect(resolved).toEqual([])
    expect(mutable).toHaveLength(2)
  })
})
