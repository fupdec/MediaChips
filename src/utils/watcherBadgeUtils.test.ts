import {describe, expect, it} from 'vitest'
import {getWatcherBadgeCounts} from '@/utils/watcherBadgeUtils'
import type {WatcherFileChangeGroup} from '@/types/watcher'

describe('getWatcherBadgeCounts', () => {
  it('returns zero counts for empty input', () => {
    expect(getWatcherBadgeCounts()).toEqual({new: 0, lost: 0})
    expect(getWatcherBadgeCounts([])).toEqual({new: 0, lost: 0})
  })

  it('sums new and lost files across groups', () => {
    const files: WatcherFileChangeGroup[] = [
      {new: [{path: 'a'}], lost: [{path: 'b'}, {path: 'c'}]} as WatcherFileChangeGroup,
      {new: [{path: 'd'}, {path: 'e'}], lost: []} as WatcherFileChangeGroup,
    ]

    expect(getWatcherBadgeCounts(files)).toEqual({new: 3, lost: 2})
  })

  it('treats missing arrays as zero', () => {
    const files = [{} as WatcherFileChangeGroup]

    expect(getWatcherBadgeCounts(files)).toEqual({new: 0, lost: 0})
  })
})
