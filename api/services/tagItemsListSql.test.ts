/**
 * @vitest-environment node
 */
import {describe, expect, it} from 'vitest'
import {assembleTagListResult, resolveTagListSqlParts} from './tagItemsListSql'

describe('resolveTagListSqlParts', () => {
  it('builds where/from/id-select pieces', () => {
    const parts = resolveTagListSqlParts({
      whereSql: 'tags.metaId = :metaId',
      needsDistinct: false,
      direction: 'asc',
    })
    expect(parts.whereClause).toBe('WHERE tags.metaId = :metaId')
    expect(parts.fromClause).toContain('FROM tags')
    expect(parts.idSelect).toBe('SELECT tags.id')
    expect(parts.sortDir).toBe('ASC')
  })

  it('uses DISTINCT when needed', () => {
    const parts = resolveTagListSqlParts({
      whereSql: '1 = 1',
      needsDistinct: true,
      direction: 'desc',
    })
    expect(parts.idSelect).toBe('SELECT DISTINCT tags.id')
    expect(parts.sortDir).toBe('DESC')
  })

  it('appends aggregate sort joins after filter joins', () => {
    const parts = resolveTagListSqlParts({
      whereSql: 'tags.metaId = :metaId',
      joinSql: 'INNER JOIN tagsInTags ON tagsInTags.parentTagId = tags.id',
      sortJoinSql: 'LEFT JOIN (SELECT 1) AS tag_sort_type_count ON 1 = 1',
      direction: 'desc',
    })
    expect(parts.fromClause).toContain('INNER JOIN tagsInTags')
    expect(parts.fromClause).toContain('tag_sort_type_count')
  })
})

describe('assembleTagListResult', () => {
  it('sets pages for paginated filtered totals', () => {
    const result = assembleTagListResult({
      items: [{id: 1}],
      totalUnfiltered: 40,
      totalFiltered: 40,
      shouldPaginate: true,
      safePage: 2,
      pageLimit: 20,
    })
    expect(result.page).toBe(2)
    expect(result.limit).toBe(20)
    expect(result.pages).toBe(2)
  })

  it('uses pages=1 for empty filtered lists', () => {
    const result = assembleTagListResult({
      items: [],
      totalUnfiltered: 10,
      totalFiltered: 0,
      shouldPaginate: true,
      safePage: 1,
      pageLimit: 25,
    })
    expect(result.pages).toBe(1)
    expect(result.totalFiltered).toBe(0)
  })
})
