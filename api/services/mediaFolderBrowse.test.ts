/**
 * @vitest-environment node
 */
import {describe, expect, it, vi, afterEach} from 'vitest'

vi.mock('../db/utils/rawQuery', () => ({
  queryAllAsync: vi.fn(),
}))

vi.mock('./mediaItemsRelations', () => ({
  fetchBaseMediaRows: vi.fn(async (_db, _mediaTypeId, ids: number[]) =>
    ids.map((id) => ({
      id,
      path: `/media/videos/file-${id}.mp4`,
      name: `file-${id}`,
      basename: `file-${id}.mp4`,
      mediaTypeId: 1,
    })),
  ),
  attachMediaRelations: vi.fn(async (_db, items) => items),
}))

import {queryAllAsync} from '../db/utils/rawQuery'
import {fetchBaseMediaRows} from './mediaItemsRelations'
import {browseLibraryFolders} from './mediaFolderBrowse'
import type {ApiDb} from '../types/db'

const mockDb = {
  sqlite: {},
  drizzle: {},
  path: '/tmp/test-db',
} as ApiDb

describe('browseLibraryFolders', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('lists disk roots when path is empty', async () => {
    vi.mocked(queryAllAsync).mockResolvedValueOnce([
      {rootPath: '/Volumes/Disk', mediaCount: 3},
      {rootPath: '/Users', mediaCount: 1},
    ]).mockResolvedValueOnce([
      {rootPath: '/Volumes/Disk', id: 11},
    ])

    const result = await browseLibraryFolders(mockDb, {})
    expect(result.currentPath).toBeNull()
    expect(result.media).toEqual([])
    expect(result.folders.map((f) => f.path)).toEqual(['/Volumes/Disk', '/Users'])
    expect(result.folders[0]?.mediaCount).toBe(3)
  })

  it('lists direct children folders and files only', async () => {
    vi.mocked(queryAllAsync)
      .mockResolvedValueOnce([
        {childName: 'Action', mediaCount: 2},
        {childName: 'Comedy', mediaCount: 1},
      ])
      .mockResolvedValueOnce([{id: 1}])
      .mockResolvedValueOnce([
        {childName: 'Action', id: 2},
        {childName: 'Action', id: 3},
      ])

    const result = await browseLibraryFolders(mockDb, {path: '/Volumes/Disk/Movies'})
    expect(result.currentPath).toBe('/Volumes/Disk/Movies')
    expect(result.parentPath).toBe('/Volumes/Disk')
    expect(result.folders.map((f) => f.path).sort()).toEqual([
      '/Volumes/Disk/Movies/Action',
      '/Volumes/Disk/Movies/Comedy',
    ])
    expect(result.folders.find((f) => f.path.endsWith('/Action'))?.mediaCount).toBe(2)
    expect(result.folders.find((f) => f.path.endsWith('/Action'))?.coverMediaIds).toEqual([2, 3])
    expect(result.media.map((m) => m.id)).toEqual([1])
    expect(result.breadcrumbs.map((b) => b.name)).toEqual(['Disk', 'Movies'])
    expect(fetchBaseMediaRows).toHaveBeenCalledWith(mockDb, null, [1])
    expect(queryAllAsync).toHaveBeenCalledTimes(3)
  })
})
