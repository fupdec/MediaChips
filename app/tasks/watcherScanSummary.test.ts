import { describe, expect, it } from 'vitest'
import { buildWatcherScanSummary } from './watcherScanSummary'

describe('buildWatcherScanSummary', () => {
  it('aggregates new and lost counts across folders', () => {
    const summary = buildWatcherScanSummary([
      {
        folder: {path: '/media/movies', name: 'Movies'} as never,
        files: [
          {type: {id: 1, extensions: 'mp4'}, new: ['/media/movies/a.mp4', '/media/movies/b.mp4'], lost: []},
          {type: {id: 2, extensions: 'mkv'}, new: [], lost: [{id: 10, path: '/media/movies/old.mkv'}]},
        ],
      },
      {
        folder: {path: '/media/clips'},
        files: [
          {type: {id: 1, extensions: 'mp4'}, new: [], lost: []},
        ],
      },
    ])

    expect(summary).toEqual({
      folderCount: 2,
      newCount: 2,
      lostCount: 1,
      folders: [
        {name: 'Movies', path: '/media/movies', newCount: 2, lostCount: 1},
        {name: undefined, path: '/media/clips', newCount: 0, lostCount: 0},
      ],
    })
  })
})
