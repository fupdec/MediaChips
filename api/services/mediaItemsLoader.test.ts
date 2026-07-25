/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('../utils/country', () => ({
  COUNTRY_DELIMITER: '\x1E',
}))

vi.mock('../db/utils/rawQuery', () => ({
  queryAllAsync: vi.fn(),
}))

vi.mock('../../app/tasks/items', () => ({
  filterItems: vi.fn((_filters, _type, items) => items),
}))

import { queryAllAsync } from '../db/utils/rawQuery'
import { loadMediaItems } from './mediaItemsLoader'
import type { ApiDb } from '../types/db'

const mockDb = {
  sqlite: {},
  drizzle: {},
  path: '/tmp/test-db',
} as ApiDb

describe('loadMediaItems', () => {
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
        return [{ mediaId: 10, tagId: 42, metaId: 7 }]
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
})
