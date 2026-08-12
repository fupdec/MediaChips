import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  WatcherSyncEngine,
  mapMediaRowsToDbEntries,
} from './watcherSync'

const findPathEntriesByMediaTypeIdsUnderFolder = vi.fn()

vi.mock('../../api/db/repositories/media', () => ({
  createMediaRepository: () => ({
    findPathEntriesByMediaTypeIdsUnderFolder,
  }),
}))

describe('mapMediaRowsToDbEntries', () => {
  it('keeps only rows for the requested type inside the folder', () => {
    const entries = mapMediaRowsToDbEntries(
      [
        {id: 1, mediaTypeId: 10, path: '/watched/movie.mp4'},
        {id: 2, mediaTypeId: 11, path: '/watched/movie.mp4'},
        {id: 3, mediaTypeId: 10, path: '/elsewhere/movie.mp4'},
      ],
      '/watched',
      10,
    )

    expect(entries).toEqual([
      {id: 1, path: '/watched/movie.mp4'},
    ])
  })
})

describe('WatcherSyncEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads database paths per watched folder instead of all media rows', async () => {
    findPathEntriesByMediaTypeIdsUnderFolder.mockImplementation(
      (_typeIds: number[], folderPath: string) => {
        if (folderPath === '/folder-a') {
          return [{id: 1, mediaTypeId: 10, path: '/folder-a/a.mp4'}]
        }
        return [{id: 2, mediaTypeId: 11, path: '/folder-b/b.mp4'}]
      },
    )

    const engine = new WatcherSyncEngine({} as never)
    await engine.fullSync([
      {
        path: '/folder-a',
        types: [{id: 10, extensions: 'mp4'}],
      },
      {
        path: '/folder-b',
        types: [{id: 11, extensions: 'mp4'}],
      },
    ])

    expect(findPathEntriesByMediaTypeIdsUnderFolder).toHaveBeenCalledTimes(2)
    expect(findPathEntriesByMediaTypeIdsUnderFolder).toHaveBeenNthCalledWith(1, [10], '/folder-a')
    expect(findPathEntriesByMediaTypeIdsUnderFolder).toHaveBeenNthCalledWith(2, [11], '/folder-b')
  })

  it('ignores file events under excluded paths', async () => {
    findPathEntriesByMediaTypeIdsUnderFolder.mockReturnValue([])

    const engine = new WatcherSyncEngine({} as never)
    engine.setFolders([
      {
        path: '/folder-a',
        excludedPaths: ['/folder-a/tmp'],
        types: [{id: 10, extensions: 'mp4'}],
      },
    ])

    expect(engine.applyFileEvent('add', '/folder-a/tmp/skip.mp4')).toBe(false)
    expect(engine.applyFileEvent('add', '/folder-a/keep.mp4')).toBe(true)
  })
})
