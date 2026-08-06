/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildFolderTagPrefixIndex,
  clearInheritedFolderTagsCache,
  folderPathPrefix,
  isMediaPathUnderFolder,
  loadInheritedFolderTagsByMediaIds,
  loadInheritedFolderTagsForMediaRows,
  matchInheritedFolderTagsWithIndex,
  normalizeMediaPathSeparators,
} from './mediaInheritedFolderTags'
import type { ApiDb } from '../types/db'

vi.mock('../db/utils/rawQuery', () => ({
  queryAllAsync: vi.fn(),
}))

import { queryAllAsync } from '../db/utils/rawQuery'

const mockSqlite = {}
const mockDb = {sqlite: mockSqlite, drizzle: {}, path: '/tmp'} as ApiDb

beforeEach(() => {
  vi.mocked(queryAllAsync).mockReset()
  clearInheritedFolderTagsCache()
})

describe('media path under folder matching', () => {
  it('normalizes separators and trailing slashes', () => {
    expect(normalizeMediaPathSeparators('C:\\media\\show\\ep.mp4')).toBe('C:/media/show/ep.mp4')
    expect(folderPathPrefix('C:\\media\\show\\')).toBe('C:/media/show')
  })

  it('matches nested media paths case-insensitively', () => {
    expect(isMediaPathUnderFolder('/Media/Show/ep.mp4', '/media/show')).toBe(true)
    expect(isMediaPathUnderFolder('/media/show', '/media/show')).toBe(false)
    expect(isMediaPathUnderFolder('/media/showcase/ep.mp4', '/media/show')).toBe(false)
  })
})

describe('folder tag prefix index', () => {
  it('matches nested folders and rejects exact/sibling prefixes', () => {
    const index = buildFolderTagPrefixIndex([
      {folderPath: '/media/show', tagId: 42, metaId: 7},
      {folderPath: '/media/show/season1', tagId: 43, metaId: 7},
      {folderPath: '/media/show/', tagId: 44, metaId: 8},
    ])

    expect(matchInheritedFolderTagsWithIndex(
      [{id: 10, path: '/Media/Show/season1/ep.mp4'}],
      index,
      7,
    )).toEqual([
      {mediaId: 10, tagId: 42, metaId: 7},
      {mediaId: 10, tagId: 43, metaId: 7},
    ])

    expect(matchInheritedFolderTagsWithIndex(
      [{id: 11, path: '/media/show'}],
      index,
    )).toEqual([])

    expect(matchInheritedFolderTagsWithIndex(
      [{id: 12, path: '/media/showcase/ep.mp4'}],
      index,
    )).toEqual([])
  })
})

describe('loadInheritedFolderTagsForMediaRows', () => {
  it('returns empty for empty rows without querying', async () => {
    await expect(loadInheritedFolderTagsForMediaRows(mockDb, [])).resolves.toEqual([])
    expect(queryAllAsync).not.toHaveBeenCalled()
  })

  it('matches provided paths against tagged folders without reloading media', async () => {
    vi.mocked(queryAllAsync).mockImplementation(async (_db, sql) => {
      if (sql.includes('tagsInFolders')) {
        return [
          {folderPath: '/media/show', tagId: 42, metaId: 7},
          {folderPath: '/other', tagId: 99, metaId: 7},
        ]
      }
      return []
    })

    const rows = await loadInheritedFolderTagsForMediaRows(mockDb, [
      {id: 10, path: '/media/show/ep.mp4'},
      {id: 11, path: '/elsewhere/x.mp4'},
    ], 7)

    expect(rows).toEqual([{mediaId: 10, tagId: 42, metaId: 7}])
    expect(queryAllAsync).toHaveBeenCalledTimes(1)
    expect(String(vi.mocked(queryAllAsync).mock.calls[0]?.[1])).toContain('tagsInFolders')
  })

  it('reuses the prefix index across hydrations until invalidated', async () => {
    vi.mocked(queryAllAsync).mockImplementation(async (_db, sql) => {
      if (sql.includes('tagsInFolders')) {
        return [{folderPath: '/media/show', tagId: 42, metaId: 7}]
      }
      return []
    })

    await loadInheritedFolderTagsForMediaRows(mockDb, [{id: 1, path: '/media/show/a.mp4'}])
    await loadInheritedFolderTagsForMediaRows(mockDb, [{id: 2, path: '/media/show/b.mp4'}])
    expect(queryAllAsync).toHaveBeenCalledTimes(1)

    clearInheritedFolderTagsCache()
    await loadInheritedFolderTagsForMediaRows(mockDb, [{id: 3, path: '/media/show/c.mp4'}])
    expect(queryAllAsync).toHaveBeenCalledTimes(2)
  })
})

describe('loadInheritedFolderTagsByMediaIds', () => {
  it('returns empty for empty ids without querying', async () => {
    await expect(loadInheritedFolderTagsByMediaIds(mockDb, [])).resolves.toEqual([])
    expect(queryAllAsync).not.toHaveBeenCalled()
  })

  it('loads media paths when only ids are available', async () => {
    vi.mocked(queryAllAsync).mockImplementation(async (_db, sql) => {
      if (sql.includes('tagsInFolders')) {
        return [
          {folderPath: '/media/show', tagId: 42, metaId: 7},
          {folderPath: '/other', tagId: 99, metaId: 7},
        ]
      }
      if (sql.includes('FROM media') && sql.includes('WHERE id IN')) {
        return [
          {id: 10, path: '/media/show/ep.mp4'},
          {id: 11, path: '/elsewhere/x.mp4'},
        ]
      }
      return []
    })

    const rows = await loadInheritedFolderTagsByMediaIds(mockDb, [10, 11], 7)
    expect(rows).toEqual([{mediaId: 10, tagId: 42, metaId: 7}])
    expect(queryAllAsync).toHaveBeenCalledTimes(2)
  })
})
