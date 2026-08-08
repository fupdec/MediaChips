/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./mediaInheritedFolderTags', () => ({
  loadInheritedFolderTagsForMediaRows: vi.fn(),
}))

vi.mock('../db/repositories/tagsInMedia', () => ({
  createTagsInMediaRepository: vi.fn(),
}))

import { applyFolderTagsOnMediaAdd } from './applyFolderTagsOnMediaAdd'
import { loadInheritedFolderTagsForMediaRows } from './mediaInheritedFolderTags'
import { createTagsInMediaRepository } from '../db/repositories/tagsInMedia'
import type { ApiDb } from '../types/db'

const bulkCreate = vi.fn()

beforeEach(() => {
  vi.mocked(loadInheritedFolderTagsForMediaRows).mockReset()
  vi.mocked(createTagsInMediaRepository).mockReset()
  bulkCreate.mockReset()
  vi.mocked(createTagsInMediaRepository).mockReturnValue({bulkCreate} as never)
})

describe('applyFolderTagsOnMediaAdd', () => {
  const db = {drizzle: {}, sqlite: {}, path: '/tmp'} as ApiDb

  it('writes inherited folder tags into tagsInMedia', async () => {
    vi.mocked(loadInheritedFolderTagsForMediaRows).mockResolvedValue([
      {mediaId: 9, tagId: 42, metaId: 7},
      {mediaId: 9, tagId: 43, metaId: 7},
    ])
    bulkCreate.mockReturnValue([{mediaId: 9}, {mediaId: 9}])

    const count = await applyFolderTagsOnMediaAdd(db, {
      id: 9,
      path: '/media/Nature/album.zip!/a.jpg',
    })

    expect(loadInheritedFolderTagsForMediaRows).toHaveBeenCalledWith(db, [
      {id: 9, path: '/media/Nature/album.zip!/a.jpg'},
    ])
    expect(bulkCreate).toHaveBeenCalledWith([
      {mediaId: 9, tagId: 42, metaId: 7},
      {mediaId: 9, tagId: 43, metaId: 7},
    ])
    expect(count).toBe(2)
  })

  it('skips when media has no id/path or no inherited tags', async () => {
    await expect(applyFolderTagsOnMediaAdd(db, {id: 0, path: '/a.jpg'})).resolves.toBe(0)
    vi.mocked(loadInheritedFolderTagsForMediaRows).mockResolvedValue([])
    await expect(applyFolderTagsOnMediaAdd(db, {id: 1, path: '/a.jpg'})).resolves.toBe(0)
    expect(bulkCreate).not.toHaveBeenCalled()
  })
})
