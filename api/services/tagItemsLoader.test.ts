import { describe, expect, it, vi, beforeEach } from 'vitest'

const getItemsForMeta = vi.fn()
const queryAllAsync = vi.fn()

vi.mock('../db/repositories/tags', () => ({
  createTagsRepository: () => ({
    getItemsForMeta,
  }),
}))

vi.mock('../db/utils/rawQuery', () => ({
  queryAllAsync: (...args: unknown[]) => queryAllAsync(...args),
}))

vi.mock('./tagFilterSql', () => ({
  getTagFilterSqlFallbackReason: () => 'test legacy path',
  resolveTagFilterQuery: vi.fn(),
  getTagFromClause: () => 'FROM tags',
  getTagSortExpression: () => 'tags.id',
  buildTagIdSelect: () => 'SELECT tags.id',
}))

vi.mock('../../app/tasks/items', () => ({
  parseItemsFromDb: (rows: unknown[]) => rows,
  filterItems: (
    _filters: unknown[],
    _type: string,
    items: Array<{ id: number }>,
  ) => items,
}))

vi.mock('./globalSearch', () => ({
  searchTagsByName: vi.fn(async () => []),
}))

vi.mock('./filterItemsWorkerRunner', () => ({
  runFilterItemsAsync: async ({items}: {items: Array<{id: number}>}) => ({
    items,
    totalFiltered: items.length,
  }),
}))

import { loadTagItems } from './tagItemsLoader'
import { searchTagsByName } from './globalSearch'

describe('loadTagItems', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('paginates tag items when page and limit are provided', async () => {
    getItemsForMeta.mockReturnValue(
      Array.from({length: 30}, (_, index) => ({id: index + 1, metaId: 17})),
    )

    const result = await loadTagItems({} as never, {
      metaId: 17,
      page: 2,
      limit: 10,
    })

    expect(getItemsForMeta).toHaveBeenCalledWith(17, [])
    expect(result.items).toHaveLength(10)
    expect((result.items as Array<{ id: number }>)[0].id).toBe(11)
    expect(result.total).toBe(30)
    expect(result.totalFiltered).toBe(30)
    expect(result.page).toBe(2)
    expect(result.limit).toBe(10)
    expect(result.pages).toBe(3)
  })

  it('maps infinite-scroll limit to page size 25', async () => {
    getItemsForMeta.mockReturnValue(
      Array.from({length: 60}, (_, index) => ({id: index + 1, metaId: 17})),
    )

    const result = await loadTagItems({} as never, {
      metaId: 17,
      page: 1,
      limit: 101,
    })

    expect(result.items).toHaveLength(25)
    expect(result.limit).toBe(25)
    expect(result.pages).toBe(3)
  })

  it('returns all matches when specific ids are requested', async () => {
    getItemsForMeta.mockReturnValue([
      {id: 5, metaId: 17},
      {id: 9, metaId: 17},
    ])

    const result = await loadTagItems({} as never, {
      metaId: 17,
      ids: [5, 9],
      page: 1,
      limit: 10,
    })

    expect(getItemsForMeta).toHaveBeenCalledWith(17, [5, 9])
    expect(result.items).toHaveLength(2)
    expect(result.page).toBe(1)
    expect(result.limit).toBe(2)
    expect(result.pages).toBeUndefined()
  })

  it('omits page count when skipTotals is true', async () => {
    getItemsForMeta.mockReturnValue(
      Array.from({length: 40}, (_, index) => ({id: index + 1, metaId: 17})),
    )

    const result = await loadTagItems({} as never, {
      metaId: 17,
      page: 2,
      limit: 25,
      skipTotals: true,
    })

    expect(result.items).toHaveLength(15)
    expect(result.pages).toBeUndefined()
  })

  it('narrows tag items by server-side search matches', async () => {
    vi.mocked(searchTagsByName).mockResolvedValueOnce([
      {id: 3, name: 'Alpha', metaId: 17, synonyms: null, matchSource: 'name'},
      {id: 7, name: 'Alpine', metaId: 17, synonyms: null, matchSource: 'name'},
    ])
    getItemsForMeta.mockReturnValue([
      {id: 3, metaId: 17, name: 'Alpha'},
      {id: 7, metaId: 17, name: 'Alpine'},
    ])

    const result = await loadTagItems({} as never, {
      metaId: 17,
      search: 'alp',
      skipTotals: true,
    })

    expect(searchTagsByName).toHaveBeenCalledWith({} as never, 'alp', {
      limit: 500,
      metaId: 17,
    })
    expect(getItemsForMeta).toHaveBeenCalledWith(17, [3, 7])
    expect(result.items).toHaveLength(2)
  })

  it('returns empty items when search matches nothing', async () => {
    vi.mocked(searchTagsByName).mockResolvedValueOnce([])
    queryAllAsync.mockResolvedValueOnce([{totalUnfiltered: 12}])

    const result = await loadTagItems({} as never, {
      metaId: 17,
      search: 'zzz',
    })

    expect(result.items).toEqual([])
    expect(result.totalFiltered).toBe(0)
    expect(result.total).toBe(12)
    expect(getItemsForMeta).not.toHaveBeenCalled()
  })
})
