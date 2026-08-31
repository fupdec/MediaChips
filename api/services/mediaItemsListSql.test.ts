/**
 * @vitest-environment node
 */
import {describe, expect, it} from 'vitest'
import {
  appendIdQueryLimitOffset,
  assembleMediaListResult,
  buildFilteredIdsFromListResult,
  buildMediaSummaryFromListResult,
  buildVisualNearDuplicateFilterSuccess,
  parseListTotalsRows,
  resolveCachedListTotals,
  resolveGroupedPageIds,
  resolveMediaListSqlParts,
  shouldComputeListTotals,
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

  it('joins metadata when includeGroupingJoin is set for navigation rows', () => {
    const parts = resolveMediaListSqlParts({
      whereSql: 'media.mediaTypeId = :mediaTypeId',
      sortBy: 'id',
      includeGroupingJoin: true,
    })
    expect(parts.fromForSort).toContain('videoMetadata')
    expect(parts.fromForSort).toContain('imageMetadata')
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

describe('shouldComputeListTotals', () => {
  it('skips totals for id-scoped or skipTotals requests', () => {
    expect(shouldComputeListTotals({skipTotals: true, ids: []})).toBe(false)
    expect(shouldComputeListTotals({skipTotals: false, ids: [1]})).toBe(false)
    expect(shouldComputeListTotals({skipTotals: false, ids: []})).toBe(true)
    expect(shouldComputeListTotals({})).toBe(true)
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

describe('legacy list result shapes', () => {
  it('builds summary and filtered-id payloads', () => {
    const list = {
      totalFiltered: 3,
      totalFilesize: 900,
      items: [{id: 1}, {id: 2}, {id: 3}],
    }
    expect(buildMediaSummaryFromListResult(list, 2)).toEqual({
      count: 3,
      previewIds: [1, 2],
    })
    expect(buildFilteredIdsFromListResult(list)).toEqual({
      ids: [1, 2, 3],
      totalFiltered: 3,
      totalFilesize: 900,
    })
  })
})

describe('list totals cache helpers', () => {
  it('returns cached totals only when both entries exist', () => {
    expect(resolveCachedListTotals({
      cachedFilteredTotals: {totalFiltered: 5, totalFilesize: 100},
      cachedUnfilteredTotal: 10,
    })).toEqual({
      totalUnfiltered: 10,
      totalFiltered: 5,
      totalFilesize: 100,
    })
    expect(resolveCachedListTotals({
      cachedFilteredTotals: {totalFiltered: 5, totalFilesize: 100},
      cachedUnfilteredTotal: null,
    })).toBeNull()
  })

  it('parses SQL total rows with numeric coercion', () => {
    expect(parseListTotalsRows(
      {totalFiltered: '4', totalFilesize: '50'},
      {totalUnfiltered: '9'},
    )).toEqual({
      totalUnfiltered: 9,
      totalFiltered: 4,
      totalFilesize: 50,
    })
  })
})

describe('resolveGroupedPageIds', () => {
  it('pages grouped ordered ids when pagination is on', () => {
    expect(resolveGroupedPageIds([1, 2, 3, 4, 5], {
      shouldPaginate: true,
      page: 2,
      limit: 2,
    })).toEqual([3, 4])
    expect(resolveGroupedPageIds([1, 2, 3], {
      shouldPaginate: false,
      page: 1,
      limit: 1,
    })).toEqual([1, 2, 3])
  })
})
