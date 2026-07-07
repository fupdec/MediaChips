import { describe, expect, it } from 'vitest'
import { getActiveWatchedFolders, isFolderWatchEnabled } from '@/services/watcherUtils'

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
