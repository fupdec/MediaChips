import { describe, expect, it } from 'vitest'
import { getActiveWatchedFolders, groupWatchedFolderLinks, isFolderWatchEnabled } from '@/services/watcherUtils'

describe('watcherUtils watch helpers', () => {
  it('treats missing watch flag as enabled', () => {
    expect(isFolderWatchEnabled({path: '/media', types: []})).toBe(true)
  })

  it('treats explicit false or zero as disabled', () => {
    expect(isFolderWatchEnabled({path: '/media', types: [], watch: false})).toBe(false)
    expect(isFolderWatchEnabled({path: '/media', types: [], watch: 0})).toBe(false)
  })

  it('returns only active watched folders', () => {
    const folders = getActiveWatchedFolders([
      {path: '/a', types: []},
      {path: '/b', types: [], watch: false},
      {path: '/c', types: [], watch: true},
    ])

    expect(folders.map((folder) => folder.path)).toEqual(['/a', '/c'])
  })
})

describe('groupWatchedFolderLinks', () => {
  it('groups types and skips orphaned folder links', () => {
    const video = {id: 1, type: 'video', name: 'Videos'}
    const image = {id: 2, type: 'image', name: 'Images'}
    const folders = groupWatchedFolderLinks([
      {
        folderId: 10,
        mediaType: video,
        watchedFolder: {id: 10, path: 'C:\\Videos', name: 'Videos', watch: true},
      },
      {
        folderId: 10,
        mediaType: image,
        watchedFolder: {id: 10, path: 'C:\\Videos', name: 'Videos', watch: true},
      },
      {
        folderId: 99,
        mediaType: video,
        watchedFolder: null,
      },
    ])

    expect(folders).toHaveLength(1)
    expect(folders[0]?.path).toBe('C:\\Videos')
    expect(folders[0]?.id).toBe(10)
    expect(folders[0]?.types.map((type) => type.id)).toEqual([1, 2])
  })
})

