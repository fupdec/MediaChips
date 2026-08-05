/**
 * @vitest-environment node
 */
import {describe, expect, it} from 'vitest'
import {
  appendIdQueryLimitOffset,
  assembleMediaListResult,
  buildVisualNearDuplicateFilterSuccess,
  resolveMediaListSqlParts,
  shouldComputeMediaListTotals,
} from './mediaItemsListSql'

describe('buildVisualNearDuplicateFilterSuccess', () => {
  it('uses nearIds when request ids are empty', () => {
    const result = buildVisualNearDuplicateFilterSuccess(2, [10, 11, 12], [])
    expect(result).toEqual({
      ok: true,
      whereSql: 'media.mediaTypeId = :mediaTypeId AND media.id IN (:visualNearIds)',
      joinSql: '',
      needsDistinct: false,
      replacements: {mediaTypeId: 2, visualNearIds: [10, 11, 12]},
    })
  })

  it('intersects request ids with nearIds', () => {
    const result = buildVisualNearDuplicateFilterSuccess(2, [10, 11, 12], ['11', 99])
    expect(result.replacements.visualNearIds).toEqual([11])
    expect(result.whereSql).toContain('media.id IN (:visualNearIds)')
  })

  it('emits empty-set predicate when intersection is empty', () => {
    const result = buildVisualNearDuplicateFilterSuccess(2, [10], [99])
    expect(result.whereSql).toBe('media.mediaTypeId = :mediaTypeId AND 0 = 1')
    expect(result.replacements).toEqual({mediaTypeId: 2})
  })
})

describe('resolveMediaListSqlParts', () => {
  it('builds shared where/from/id-select pieces', () => {
    const parts = resolveMediaListSqlParts({
      whereSql: 'media.mediaTypeId = :mediaTypeId',
      needsDistinct: false,
      sortBy: 'id',
      direction: 'asc',
    })
    expect(parts.whereClause).toBe('WHERE media.mediaTypeId = :mediaTypeId')
    expect(parts.sortDir).toBe('ASC')
    expect(parts.idSelect).toBe('SELECT media.id')
    expect(parts.fromForCount).toContain('FROM media')
    expect(parts.fromForSort).toContain('FROM media')
  })

  it('uses DISTINCT id select when needed', () => {
    const parts = resolveMediaListSqlParts({
      whereSql: '1 = 1',
      needsDistinct: true,
      direction: 'desc',
    })
    expect(parts.idSelect).toBe('SELECT DISTINCT media.id')
    expect(parts.sortDir).toBe('DESC')
  })
})

describe('shouldComputeMediaListTotals', () => {
  it('skips totals for id-scoped or skipTotals requests', () => {
    expect(shouldComputeMediaListTotals({skipTotals: true, ids: []})).toBe(false)
    expect(shouldComputeMediaListTotals({skipTotals: false, ids: [1]})).toBe(false)
    expect(shouldComputeMediaListTotals({skipTotals: false, ids: []})).toBe(true)
    expect(shouldComputeMediaListTotals({})).toBe(true)
  })
})

describe('appendIdQueryLimitOffset', () => {
  it('appends limit/offset replacements when paginating', () => {
    const replacements: Record<string, unknown> = {}
    const sql = appendIdQueryLimitOffset('SELECT media.id FROM media', replacements, {
      shouldPaginate: true,
      pageLimit: 25,
      safePage: 3,
    })
    expect(sql).toBe('SELECT media.id FROM media LIMIT :limit OFFSET :offset')
    expect(replacements).toEqual({limit: 25, offset: 50})
  })

  it('leaves sql unchanged when not paginating', () => {
    const replacements: Record<string, unknown> = {}
    const sql = appendIdQueryLimitOffset('SELECT media.id', replacements, {
      shouldPaginate: false,
      pageLimit: 25,
      safePage: 1,
    })
    expect(sql).toBe('SELECT media.id')
    expect(replacements).toEqual({})
  })
})

describe('assembleMediaListResult', () => {
  it('sets pages for paginated filtered totals', () => {
    const result = assembleMediaListResult({
      items: [{id: 1} as never],
      totalUnfiltered: 100,
      totalFiltered: 50,
      totalFilesize: 1000,
      shouldPaginate: true,
      safePage: 2,
      pageLimit: 25,
    })
    expect(result.page).toBe(2)
    expect(result.limit).toBe(25)
    expect(result.pages).toBe(2)
    expect(result.total).toBe(100)
  })

  it('omits pages when totals skipped', () => {
    const result = assembleMediaListResult({
      items: [],
      totalUnfiltered: null,
      totalFiltered: null,
      totalFilesize: null,
      shouldPaginate: true,
      safePage: 1,
      pageLimit: 25,
      skipTotals: true,
    })
    expect(result.pages).toBeUndefined()
    expect(result.page).toBe(1)
  })
})
