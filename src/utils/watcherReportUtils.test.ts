import { describe, expect, it } from 'vitest'
import { removeWatcherNewPaths } from './watcherReportUtils'
import type { WatcherFilesEntry } from '@/types/watcher'

describe('removeWatcherNewPaths', () => {
  const entries: WatcherFilesEntry[] = [{
    folder: {id: 1, name: 'torrents', path: '/Volumes/pron/#torrents/'},
    files: [{
      type: {id: 10, extensions: 'mp4'},
      new: [
        '/Volumes/pron/#torrents/a.mp4',
        '/Volumes/pron/#torrents/b.mp4',
      ],
      lost: [],
    }],
  }]

  it('removes added paths from watcher new lists', () => {
    const updated = removeWatcherNewPaths(entries, ['/Volumes/pron/#torrents/a.mp4'])

    expect(updated[0].files[0].new).toEqual(['/Volumes/pron/#torrents/b.mp4'])
  })
})
