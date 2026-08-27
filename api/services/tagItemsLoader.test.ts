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
  getTagSortPlan: () => ({expression: 'tags.id', joinSql: ''}),
  getTagSortExpression: () => 'tags.id',
  buildTagIdSelect: () => 'SELECT tags.id',
}))

vi.mock('./filterItems', () => ({
  parseItemsFromDb: (rows: unknown[]) => rows,
  filterItems: (
    _filters: unknown[],
    _type: string,
    items: Array<{ id: number }>,
  ) => items,
}))

vi.mock('./filterItemsWorkerRunner', () => ({
  runFilterItemsAsync: async ({items}: {items: Array<{id: number}>}) => ({
    items,
    totalFiltered: items.length,
  }),
}))

import { loadTagItems } from './tagItemsLoader'

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

  it('narrows tag items by mid-string and synonym search', async () => {
    queryAllAsync.mockResolvedValueOnce([
      {id: 1, name: 'Zeta', synonyms: null},
      {id: 3, name: 'Scalpel', synonyms: null},
      {id: 7, name: 'Display', synonyms: 'Alpine Peak'},
      {id: 9, name: 'Other', synonyms: null},
    ])
    getItemsForMeta.mockReturnValue([
      {id: 3, metaId: 17, name: 'Scalpel'},
      {id: 7, metaId: 17, name: 'Display'},
    ])

    const result = await loadTagItems({} as never, {
      metaId: 17,
      search: 'alp',
      searchMode: 'substring',
      skipTotals: true,
    })

    expect(queryAllAsync).toHaveBeenCalledWith(
      {} as never,
      expect.stringContaining('SELECT id, name, synonyms'),
      {metaId: 17},
    )
    expect(getItemsForMeta).toHaveBeenCalledWith(17, [3, 7])
    expect(result.items).toHaveLength(2)
  })

  it('matches chars-with-gaps search mode', async () => {
    queryAllAsync.mockResolvedValueOnce([
      {id: 2, name: 'favorite video', synonyms: null},
      {id: 4, name: 'unrelated', synonyms: null},
    ])
    getItemsForMeta.mockReturnValue([
      {id: 2, metaId: 17, name: 'favorite video'},
    ])

    const result = await loadTagItems({} as never, {
      metaId: 17,
      search: 'fade',
      searchMode: 'chars',
      skipTotals: true,
    })

    expect(getItemsForMeta).toHaveBeenCalledWith(17, [2])
    expect(result.items).toHaveLength(1)
  })

  it('returns empty items when search matches nothing', async () => {
    queryAllAsync
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{totalUnfiltered: 12}])

    const result = await loadTagItems({} as never, {
      metaId: 17,
      search: 'zzz',
    })

    expect(result.items).toEqual([])
    expect(result.totalFiltered).toBe(0)
    expect(result.total).toBe(12)
    expect(getItemsForMeta).not.toHaveBeenCalled()
  })

  it('narrows tag items by color hex (case-insensitive)', async () => {
    queryAllAsync.mockResolvedValueOnce([
      {id: 2, color: '#ff0000'},
      {id: 5, color: '#FF0000'},
      {id: 9, color: '#0000ff'},
    ])
    getItemsForMeta.mockReturnValue([
      {id: 2, metaId: 17, color: '#ff0000'},
      {id: 5, metaId: 17, color: '#FF0000'},
    ])

    const result = await loadTagItems({} as never, {
      metaId: 17,
      colorFilter: '#FF0000',
      skipTotals: true,
    })

    expect(queryAllAsync).toHaveBeenCalledWith(
      {} as never,
      expect.stringContaining('SELECT id, color FROM tags'),
      {metaId: 17},
    )
    expect(getItemsForMeta).toHaveBeenCalledWith(17, [2, 5])
    expect(result.items).toHaveLength(2)
  })

  it('groups similar hex colors into one filter', async () => {
    queryAllAsync.mockResolvedValueOnce([
      {id: 1, color: '#ff0000'},
      {id: 2, color: '#ee1111'},
      {id: 3, color: '#0000ff'},
    ])
    getItemsForMeta.mockReturnValue([
      {id: 1, metaId: 17, color: '#ff0000'},
      {id: 2, metaId: 17, color: '#ee1111'},
    ])

    const result = await loadTagItems({} as never, {
      metaId: 17,
      colorFilter: '#ff0000',
      skipTotals: true,
    })

    expect(getItemsForMeta).toHaveBeenCalledWith(17, [1, 2])
    expect(result.items).toHaveLength(2)
  })

  it('narrows tag items with no color', async () => {
    queryAllAsync.mockResolvedValueOnce([{id: 8}])
    getItemsForMeta.mockReturnValue([
      {id: 8, metaId: 17, color: null},
    ])

    const result = await loadTagItems({} as never, {
      metaId: 17,
      colorFilter: 'none',
      skipTotals: true,
    })

    expect(queryAllAsync).toHaveBeenCalledWith(
      {} as never,
      expect.stringContaining('color IS NULL'),
      {metaId: 17},
    )
    expect(getItemsForMeta).toHaveBeenCalledWith(17, [8])
    expect(result.items).toHaveLength(1)
  })

  it('combines color filter with namePrefix (AND)', async () => {
    queryAllAsync
      .mockResolvedValueOnce([
        {id: 1, name: 'Alpha red'},
        {id: 2, name: 'Alpha blue'},
        {id: 3, name: 'Beta red'},
      ])
      .mockResolvedValueOnce([
        {id: 1, color: '#ff0000'},
        {id: 2, color: '#0000ff'},
        {id: 3, color: '#ff0000'},
      ])
    getItemsForMeta.mockReturnValue([
      {id: 1, metaId: 17, name: 'Alpha red', color: '#ff0000'},
    ])

    const result = await loadTagItems({} as never, {
      metaId: 17,
      namePrefix: 'A',
      colorFilter: '#ff0000',
      skipTotals: true,
    })

    expect(getItemsForMeta).toHaveBeenCalledWith(17, [1])
    expect(result.items).toHaveLength(1)
    expect((result.items as Array<{id: number}>)[0].id).toBe(1)
  })

  it('returns empty items when color filter matches nothing', async () => {
    queryAllAsync
      .mockResolvedValueOnce([
        {id: 1, color: '#ff0000'},
      ])
      .mockResolvedValueOnce([{totalUnfiltered: 9}])

    const result = await loadTagItems({} as never, {
      metaId: 17,
      colorFilter: '#0000ff',
    })

    expect(result.items).toEqual([])
    expect(result.totalFiltered).toBe(0)
    expect(result.total).toBe(9)
    expect(getItemsForMeta).not.toHaveBeenCalled()
  })

  it('ignores invalid color filter values', async () => {
    getItemsForMeta.mockReturnValue([
      {id: 1, metaId: 17},
      {id: 2, metaId: 17},
    ])

    const result = await loadTagItems({} as never, {
      metaId: 17,
      colorFilter: 'red',
      skipTotals: true,
    })

    expect(queryAllAsync).not.toHaveBeenCalled()
    expect(getItemsForMeta).toHaveBeenCalledWith(17, [])
    expect(result.items).toHaveLength(2)
  })
})
