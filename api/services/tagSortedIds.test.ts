import {describe, expect, it, vi, beforeEach} from 'vitest'

const queryAllAsync = vi.fn()

vi.mock('../db/utils/rawQuery', () => ({
  queryAllAsync: (...args: unknown[]) => queryAllAsync(...args),
}))

vi.mock('./resolveSortMetaType', () => ({
  resolveSortMetaType: () => null,
}))

vi.mock('./tagFilterSql', () => ({
  getTagFilterSqlFallbackReason: () => null,
  resolveTagFilterQuery: () => ({
    ok: true,
    whereSql: 'tags.metaId = :metaId',
    replacements: {metaId: 5},
  }),
  getTagFromClause: () => 'FROM tags',
  getTagSortPlan: (sortBy: string) => ({expression: `tags.${sortBy}`, joinSql: ''}),
  buildTagIdSelect: () => 'SELECT tags.id',
}))

import {loadTagSortedIds} from './tagItemsLoader'

describe('loadTagSortedIds', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns ids in page sort order with a stable tiebreak', async () => {
    queryAllAsync.mockResolvedValue([{id: 3}, {id: '1'}, {id: 2}])

    const ids = await loadTagSortedIds({} as never, {metaId: 5, sortBy: 'views', direction: 'desc'})

    expect(ids).toEqual([3, 1, 2])
    const [, sql, replacements] = queryAllAsync.mock.calls[0]
    expect(sql).toContain('ORDER BY tags.views DESC, tags.id ASC')
    expect(sql).not.toMatch(/LIMIT/i)
    expect(replacements).toEqual({metaId: 5})
  })
})
