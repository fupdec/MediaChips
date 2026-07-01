import {describe, expect, it} from 'vitest'
import {getWatcherBadgeCounts} from '@/utils/watcherBadgeUtils'
import type {WatcherFileChangeGroup} from '@/types/watcher'

const videoType = {id: 1, type: 'video'}

describe('getWatcherBadgeCounts', () => {
  it('returns zero counts for empty input', () => {
    expect(getWatcherBadgeCounts()).toEqual({new: 0, lost: 0})
    expect(getWatcherBadgeCounts([])).toEqual({new: 0, lost: 0})
  })

  it('sums new and lost files across groups', () => {
    const files: WatcherFileChangeGroup[] = [
      {
        type: videoType,
        new: ['a'],
        lost: [{id: 1, path: 'b'}, {id: 2, path: 'c'}],
      },
      {
        type: videoType,
        new: ['d', 'e'],
        lost: [],
      },
    ]

    expect(getWatcherBadgeCounts(files)).toEqual({new: 3, lost: 2})
  })

  it('treats missing arrays as zero', () => {
    const files = [{type: videoType} as WatcherFileChangeGroup]

    expect(getWatcherBadgeCounts(files)).toEqual({new: 0, lost: 0})
  })
})
