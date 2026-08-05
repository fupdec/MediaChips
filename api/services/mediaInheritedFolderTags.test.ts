/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest'
import {
  folderPathPrefix,
  isMediaPathUnderFolder,
  loadInheritedFolderTagsByMediaIds,
  normalizeMediaPathSeparators,
} from './mediaInheritedFolderTags'
import type { ApiDb } from '../types/db'

vi.mock('../db/utils/rawQuery', () => ({
  queryAllAsync: vi.fn(),
}))

import { queryAllAsync } from '../db/utils/rawQuery'

const mockDb = {sqlite: {}, drizzle: {}, path: '/tmp'} as ApiDb

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

describe('loadInheritedFolderTagsByMediaIds', () => {
  it('returns empty for empty ids without querying', async () => {
    await expect(loadInheritedFolderTagsByMediaIds(mockDb, [])).resolves.toEqual([])
    expect(queryAllAsync).not.toHaveBeenCalled()
  })

  it('matches page media against tagged folders in memory', async () => {
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
  })
})
