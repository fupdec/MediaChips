import {describe, expect, it} from 'vitest'
import {
  buildTagScopeClause,
  enrichTagSearchRow,
  normalizeMetaId,
  normalizeSearchGlobalOptions,
  normalizeSearchTagsOptions,
  pinnedTagReplacements,
} from './globalSearchScope'

describe('globalSearchScope', () => {
  it('normalizes search options and meta ids', () => {
    expect(normalizeSearchGlobalOptions(12)).toEqual({limit: 12})
    expect(normalizeSearchGlobalOptions({limit: 5, tagIds: [1]})).toEqual({
      limit: 5,
      tagIds: [1],
    })
    expect(normalizeMetaId('3')).toBe(3)
    expect(normalizeMetaId('x')).toBeNull()
    expect(normalizeSearchTagsOptions(8, {metaId: 2})).toEqual({
      limit: 8,
      metaId: 2,
      cooccurWithTagIds: undefined,
      excludeTagIds: undefined,
    })
  })

  it('builds tag scope clauses and pinned replacements', () => {
    expect(pinnedTagReplacements([1, 2])).toEqual({
      pinnedTagIds: [1, 2],
      pinnedTagCount: 2,
    })

    const scoped = buildTagScopeClause({
      metaId: 4,
      cooccurWithTagIds: [1, 2],
      excludeTagIds: [9],
    })
    expect(scoped.clause).toContain('tags.metaId = :metaId')
    expect(scoped.clause).toContain('NOT IN (:pinnedTagIds)')
    expect(scoped.replacements).toMatchObject({
      metaId: 4,
      pinnedTagIds: [1, 2],
      pinnedTagCount: 2,
    })
    expect(scoped.replacements.excludeTagIds).toBeUndefined()
  })

  it('enriches matching tag rows', () => {
    const row = enrichTagSearchRow(
      {id: 1, name: 'Alice', metaId: 2, synonyms: 'ali'},
      'ali',
    )
    expect(row).toMatchObject({
      id: 1,
      name: 'Alice',
    })
    expect(row?.matchSource).toBeTruthy()
    expect(enrichTagSearchRow({id: 1, name: 'Bob'}, 'zzz')).toBeNull()
  })
})
