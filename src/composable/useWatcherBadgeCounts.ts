import { computed } from 'vue'
import { useWatcherStore } from '@/stores/watcher'
import { getWatcherBadgeCounts, type WatcherBadgeCounts } from '@/utils/watcherBadgeUtils'

export function useWatcherBadgeCounts() {
  const watcherStore = useWatcherStore()

  const watcherBadgeCountsByFolderId = computed(() => {
    const counts: Record<number, WatcherBadgeCounts> = {}
    for (const entry of watcherStore.files) {
      counts[entry.folder.id] = getWatcherBadgeCounts(entry.files)
    }
    return counts
  })

  return { watcherBadgeCountsByFolderId }
}
