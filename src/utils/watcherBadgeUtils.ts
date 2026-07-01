import type { WatcherFileChangeGroup } from '@/types/watcher'

export interface WatcherBadgeCounts {
  new: number
  lost: number
}

export function getWatcherBadgeCounts(
  files: WatcherFileChangeGroup[] = [],
): WatcherBadgeCounts {
  let newCount = 0
  let lostCount = 0

  for (const group of files) {
    newCount += group.new?.length ?? 0
    lostCount += group.lost?.length ?? 0
  }

  return { new: newCount, lost: lostCount }
}

export function getWatcherBadgeCount(
  files: WatcherFileChangeGroup[] = [],
  field: 'new' | 'lost' = 'new',
): number {
  return getWatcherBadgeCounts(files)[field]
}
