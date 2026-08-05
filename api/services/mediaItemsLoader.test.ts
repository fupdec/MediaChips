/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, afterEach } from 'vitest'

vi.mock('../utils/country', () => ({
  COUNTRY_DELIMITER: '\x1E',
}))

vi.mock('../db/utils/rawQuery', () => ({
  queryAllAsync: vi.fn(),
}))

vi.mock('./filterItems', () => ({
  filterItems: vi.fn((_filters, _type, items) => items),
}))

import { queryAllAsync } from '../db/utils/rawQuery'
import { loadMediaItems } from './mediaItemsLoader'
import {
  clearMediaListTotalsCache,
  getCachedFilteredTotals,
  buildFilteredTotalsCacheKey,
} from './mediaListTotalsCache'
import type { ApiDb } from '../types/db'

const mockDb = {
  sqlite: {},
  drizzle: {},
  path: '/tmp/test-db',
} as ApiDb

describe('loadMediaItems', () => {
  afterEach(() => {
    clearMediaListTotalsCache()
    vi.clearAllMocks()
  })

  it('uses SQL pagination with limit and offset replacements', async () => {
    vi.mocked(queryAllAsync).mockImplementation(async (_db, sql, replacements) => {
      if (sql.includes('LIMIT :limit')) {
        expect(replacements).toMatchObject({ limit: 25, offset: 0 })
        return [{ id: 1 }, { id: 2 }]
      }
      if (sql.includes('totalFilesize')) {
        return [{ totalFiltered: 2, totalFilesize: 3000 }]
      }
      if (sql.includes('totalUnfiltered')) {
        return [{ totalUnfiltered: 2 }]
      }
      if (sql.includes('WHERE media.id IN')) {
        return [
          { id: 1, mediaTypeId: 1, path: '/a.mp4', name: 'a.mp4', filesize: 1000 },
          { id: 2, mediaTypeId: 1, path: '/b.mp4', name: 'b.mp4', filesize: 2000 },
        ]
      }
      if (sql.includes('tagsInFolders') || sql.includes('folderPaths')) return []
      if (sql.includes('tagsInMedia')) return []
      if (sql.includes('valuesInMedia')) return []
      return []
    })

    const result = await loadMediaItems(mockDb, {
      mediaTypeId: 1,
      page: 1,
      limit: 25,
    })

    expect(result.items).toHaveLength(2)
    expect(result.totalFiltered).toBe(2)
    expect(result.limit).toBe(25)
  })

  it('warns and uses legacy path for unsupported SQL filters', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    vi.mocked(queryAllAsync).mockImplementation(async (_db, sql) => {
      if (sql.includes('WHERE media.mediaTypeId')) {
        return [{ id: 1, mediaTypeId: 1, path: '/a.mp4', name: 'a.mp4', filesize: 1000 }]
      }
      if (sql.includes('tagsInFolders') || sql.includes('folderPaths')) return []
      if (sql.includes('tagsInMedia') || sql.includes('valuesInMedia')) return []
      return []
    })

    const result = await loadMediaItems(mockDb, {
      mediaTypeId: 1,
      limit: 10,
      filters: [{
        active: true,
        param: 'unknownField',
        type: 'string',
        cond: 'includes',
        val: 'foo',
      }],
    })

    expect(result.items).toHaveLength(1)
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('[mediaItemsLoader] Using legacy JS filter path:'),
      expect.stringContaining('unknownField'),
      expect.any(String),
    )

    warn.mockRestore()
  })

  it('merges inherited folder tags into media card tags', async () => {
    vi.mocked(queryAllAsync).mockImplementation(async (_db, sql) => {
      if (sql.includes('LIMIT :limit')) {
        return [{ id: 10 }]
      }
      if (sql.includes('totalFilesize')) {
        return [{ totalFiltered: 1, totalFilesize: 1000 }]
      }
      if (sql.includes('totalUnfiltered')) {
        return [{ totalUnfiltered: 1 }]
      }
      if (sql.includes('WHERE media.id IN')) {
        return [{ id: 10, mediaTypeId: 1, path: '/media/show/ep.mp4', name: 'ep.mp4', filesize: 1000 }]
      }
      if (sql.includes('tagsInFolders') || sql.includes('folderPaths')) {
        return [{ folderPath: '/media/show', tagId: 42, metaId: 7 }]
      }
      if (sql.includes('SELECT id, path FROM media')) {
        return [{ id: 10, path: '/media/show/ep.mp4' }]
      }
      if (sql.includes('FROM tagsInMedia') || sql.includes('tagsInMedia WHERE')) {
        return [{ mediaId: 10, tagId: 11, metaId: 7 }]
      }
      if (sql.includes('valuesInMedia')) return []
      return []
    })

    const result = await loadMediaItems(mockDb, {
      mediaTypeId: 1,
      page: 1,
      limit: 25,
    })

    expect(result.items).toHaveLength(1)
    expect(result.items[0].tags).toEqual(expect.arrayContaining([
      { tagId: 11, metaId: 7 },
      { tagId: 42, metaId: 7, fromFolder: true },
    ]))
  })

  it('does not poison filtered totals cache on id-scoped refresh', async () => {
    clearMediaListTotalsCache()
    const cacheKey = buildFilteredTotalsCacheKey({ mediaTypeId: 1, filters: [] })

    vi.mocked(queryAllAsync).mockImplementation(async (_db, sql, replacements) => {
      if (sql.includes('SELECT') && sql.includes('FROM media') && sql.includes('ORDER BY') && !sql.includes('totalFilesize') && !sql.includes('totalUnfiltered') && !sql.includes('WHERE media.id IN')) {
        // Id-scoped list: no LIMIT when ids are provided.
        expect(replacements).toMatchObject({ ids: [7] })
        return [{ id: 7 }]
      }
      if (sql.includes('totalFilesize')) {
        // Would be wrong if id-scoped totals were written (COUNT for id=7 → 1).
        return [{ totalFiltered: 1, totalFilesize: 500 }]
      }
      if (sql.includes('totalUnfiltered')) {
        return [{ totalUnfiltered: 18999 }]
      }
      if (sql.includes('WHERE media.id IN')) {
        return [{ id: 7, mediaTypeId: 1, path: '/one.mp4', name: 'one.mp4', filesize: 500 }]
      }
      if (sql.includes('tagsInFolders') || sql.includes('folderPaths')) return []
      if (sql.includes('tagsInMedia') || sql.includes('valuesInMedia')) return []
      return []
    })

    const scoped = await loadMediaItems(mockDb, {
      mediaTypeId: 1,
      ids: [7],
      page: 1,
      limit: 25,
    })

    expect(scoped.items).toHaveLength(1)
    expect(scoped.totalFiltered).toBeNull()
    expect(getCachedFilteredTotals(cacheKey)).toBeNull()

    // Full list after id-scoped refresh must still compute real totals.
    vi.mocked(queryAllAsync).mockImplementation(async (_db, sql) => {
      if (sql.includes('LIMIT :limit')) {
        return [{ id: 1 }, { id: 2 }]
      }
      if (sql.includes('totalFilesize')) {
        return [{ totalFiltered: 18999, totalFilesize: 999999 }]
      }
      if (sql.includes('totalUnfiltered')) {
        return [{ totalUnfiltered: 18999 }]
      }
      if (sql.includes('WHERE media.id IN')) {
        return [
          { id: 1, mediaTypeId: 1, path: '/a.mp4', name: 'a.mp4', filesize: 1000 },
          { id: 2, mediaTypeId: 1, path: '/b.mp4', name: 'b.mp4', filesize: 2000 },
        ]
      }
      if (sql.includes('tagsInFolders') || sql.includes('folderPaths')) return []
      if (sql.includes('tagsInMedia') || sql.includes('valuesInMedia')) return []
      return []
    })

    const full = await loadMediaItems(mockDb, {
      mediaTypeId: 1,
      page: 1,
      limit: 25,
    })

    expect(full.totalFiltered).toBe(18999)
    expect(getCachedFilteredTotals(cacheKey)).toEqual({
      totalFiltered: 18999,
      totalFilesize: 999999,
    })
  })

  it('groups multi-tag filters with one slim query (no DISTINCT id rehydrate phase)', async () => {
    const sqlCalls: string[] = []
    vi.mocked(queryAllAsync).mockImplementation(async (_db, sql) => {
      sqlCalls.push(String(sql))
      if (sql.includes('videoMetadata.duration') && sql.includes('FROM media')) {
        return [
          {id: 1, path: '/a/x.mp4', name: 'x', filesize: 1, mediaTypeId: 1},
          {id: 2, path: '/b/y.mp4', name: 'y', filesize: 2, mediaTypeId: 1},
        ]
      }
      if (sql.includes('totalFilesize')) {
        return [{totalFiltered: 2, totalFilesize: 3}]
      }
      if (sql.includes('totalUnfiltered')) {
        return [{totalUnfiltered: 2}]
      }
      if (sql.includes('WHERE media.id IN')) {
        return [
          {id: 1, mediaTypeId: 1, path: '/a/x.mp4', name: 'x', filesize: 1},
          {id: 2, mediaTypeId: 1, path: '/b/y.mp4', name: 'y', filesize: 2},
        ]
      }
      if (sql.includes('SELECT id, path FROM media')) {
        return [
          {id: 1, path: '/a/x.mp4'},
          {id: 2, path: '/b/y.mp4'},
        ]
      }
      if (sql.includes('tagsInFolders') || sql.includes('folderPaths')) return []
      if (sql.includes('tagsInMedia') || sql.includes('valuesInMedia')) return []
      return []
    })

    const result = await loadMediaItems(mockDb, {
      mediaTypeId: 1,
      groupBy: 'path',
      page: 1,
      limit: 25,
      filters: [{
        active: true,
        param: 17,
        type: 'array',
        cond: 'in',
        val: [1050, 1051],
      }],
    })

    expect(result.groups?.length).toBeGreaterThan(0)
    expect(sqlCalls.some((sql) => (
      sql.includes('videoMetadata.duration')
      && sql.includes('tagsInMedia')
    ))).toBe(true)
    // Join subqueries may SELECT DISTINCT media.id AS mediaId; the old
    // two-phase path selected DISTINCT media.id as the outer id list.
    expect(sqlCalls.some((sql) => (
      /^\s*SELECT\s+DISTINCT\s+media\.id\s*$/im.test(sql)
      || /^\s*SELECT\s+DISTINCT\s+media\.id\s*\n/im.test(sql)
    ))).toBe(false)
  })
})
