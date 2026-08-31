import { describe, expect, it, vi, beforeEach } from 'vitest'
import { promises as fs } from 'fs'
import {
  WatcherSyncEngine,
  mapMediaRowsToDbEntries,
  recomputeDiff,
  pathSyncKey,
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

describe('recomputeDiff', () => {
  it('matches known and unknown paths in linear time for large sets', () => {
    const n = 20_000
    const fsPaths = Array.from({length: n}, (_, i) => `/media/clip_${i}.mp4`)
    const dbEntries = Array.from({length: n}, (_, i) => ({
      id: i,
      path: i < n - 3 ? `/media/clip_${i}.mp4` : `/media/gone_${i}.mp4`,
    }))

    const state = {
      type: {id: 1, extensions: 'mp4'},
      extensions: ['mp4'],
      fsPaths,
      dbEntries,
      newPaths: [] as string[],
      lostEntries: [] as Array<{id: number; path: string}>,
    }

    const t0 = Date.now()
    recomputeDiff(state)
    const elapsed = Date.now() - t0

    expect(elapsed).toBeLessThan(1500)
    expect(state.newPaths).toEqual([
      `/media/clip_${n - 3}.mp4`,
      `/media/clip_${n - 2}.mp4`,
      `/media/clip_${n - 1}.mp4`,
    ])
    expect(state.lostEntries.map((entry) => entry.path)).toEqual([
      `/media/gone_${n - 3}.mp4`,
      `/media/gone_${n - 2}.mp4`,
      `/media/gone_${n - 1}.mp4`,
    ])
  })

  it('treats path case as the same sync key', () => {
    expect(pathSyncKey('/Media/A.MP4')).toBe(pathSyncKey('/media/a.mp4'))
    const state = {
      type: {id: 1, extensions: 'mp4'},
      extensions: ['mp4'],
      fsPaths: ['/Media/A.mp4'],
      dbEntries: [{id: 1, path: '/media/a.mp4'}],
      newPaths: [] as string[],
      lostEntries: [] as Array<{id: number; path: string}>,
    }
    recomputeDiff(state)
    expect(state.newPaths).toEqual([])
    expect(state.lostEntries).toEqual([])
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

  it('refreshDbPaths keeps tracked filesystem paths and does not mark them as lost', async () => {
    findPathEntriesByMediaTypeIdsUnderFolder.mockReturnValue([
      {id: 1, mediaTypeId: 10, path: '/folder-a/a.mp4'},
      {id: 2, mediaTypeId: 10, path: '/folder-a/b.mp4'},
    ])

    const engine = new WatcherSyncEngine({} as never)
    engine.setFolders([{
      path: '/folder-a',
      types: [{id: 10, extensions: 'mp4'}],
    }])

    engine.applyFileEvent('add', '/folder-a/a.mp4')
    engine.applyFileEvent('add', '/folder-a/b.mp4')

    await engine.refreshDbPaths()

    const report = engine.getReports()[0]?.files[0]
    expect(report?.lost).toEqual([])
    expect(report?.new).toEqual([])
  })

  it('refreshDbPaths reconciles db entries missing from fsPaths when the file still exists', async () => {
    findPathEntriesByMediaTypeIdsUnderFolder.mockReturnValue([
      {id: 1, mediaTypeId: 10, path: '/folder-a/a.mp4'},
    ])

    const accessSpy = vi.spyOn(fs, 'access').mockResolvedValue(undefined)

    const engine = new WatcherSyncEngine({} as never)
    engine.setFolders([{
      path: '/folder-a',
      types: [{id: 10, extensions: 'mp4'}],
    }])

    await engine.refreshDbPaths()

    expect(accessSpy).toHaveBeenCalledWith('/folder-a/a.mp4')
    const report = engine.getReports()[0]?.files[0]
    expect(report?.lost).toEqual([])
    expect(report?.new).toEqual([])

    accessSpy.mockRestore()
  })

  it('refreshDbPaths keeps genuinely missing files in lost', async () => {
    findPathEntriesByMediaTypeIdsUnderFolder.mockReturnValue([
      {id: 1, mediaTypeId: 10, path: '/folder-a/missing.mp4'},
    ])

    const accessSpy = vi.spyOn(fs, 'access').mockRejectedValue(new Error('ENOENT'))

    const engine = new WatcherSyncEngine({} as never)
    engine.setFolders([{
      path: '/folder-a',
      types: [{id: 10, extensions: 'mp4'}],
    }])

    await engine.refreshDbPaths()

    const report = engine.getReports()[0]?.files[0]
    expect(report?.lost).toEqual([{id: 1, path: '/folder-a/missing.mp4'}])
    expect(report?.new).toEqual([])

    accessSpy.mockRestore()
  })
})
