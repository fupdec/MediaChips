import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {useEventBus} from '@/utils/eventBus'
import {useTasksStore} from '@/stores/tasks'
import {useWatcherStore} from '@/stores/watcher'
import {useMediaInboxStore} from '@/stores/mediaInbox'
import {
  collectMediaInboxLostItems,
  collectMediaInboxNewItems,
  countMediaInboxLost,
  countMediaInboxNew,
  groupMediaInboxNewItems,
  type MediaInboxNewGroup,
  type MediaInboxNewItem,
} from '@/utils/mediaInbox'

export function useMediaInbox() {
  const {t} = useI18n()
  const eventBus = useEventBus()
  const tasksStore = useTasksStore()
  const watcherStore = useWatcherStore()
  const inboxStore = useMediaInboxStore()

  const newItems = computed(() =>
    collectMediaInboxNewItems(watcherStore.menuEntries, inboxStore.ignoredPaths),
  )
  const newGroups = computed(() => groupMediaInboxNewItems(newItems.value))
  const lostItems = computed(() => collectMediaInboxLostItems(watcherStore.menuEntries))
  const newCount = computed(() =>
    countMediaInboxNew(watcherStore.menuEntries, inboxStore.ignoredPaths),
  )
  const lostCount = computed(() => countMediaInboxLost(watcherStore.menuEntries))
  const badgeCount = computed(() => newCount.value + inboxStore.pendingCount)

  function openInbox(tab: 'new' | 'lost' | 'pending' = 'new') {
    if (tab === 'new' && newCount.value === 0 && lostCount.value > 0) {
      inboxStore.open('lost')
      return
    }
    if (tab === 'new' && newCount.value === 0 && inboxStore.pendingCount > 0) {
      inboxStore.open('pending')
      return
    }
    inboxStore.open(tab)
  }

  function addInboxItems(items: MediaInboxNewItem[]) {
    if (!items.length) return false
    const mediaTypeId = items[0].mediaTypeId
    const paths = items.map((item) => item.path)
    inboxStore.close()

    tasksStore.mediaAdding.directFiles = [...paths]
    tasksStore.mediaAdding.skipFileScan = true
    tasksStore.mediaAdding.fromInbox = true
    tasksStore.mediaAdding.paths = ''
    tasksStore.mediaAdding.dialogProcess = true
    tasksStore.mediaAdding.active = true
    tasksStore.mediaAdding.media_type_id = mediaTypeId

    eventBus.emit('addMedia', () => {
      eventBus.emit('update:watcher')
    })
    return true
  }

  function addInboxGroup(group: MediaInboxNewGroup) {
    return addInboxItems(group.items)
  }

  function addAllNew() {
    // Add one media-type group at a time (import pipeline is per type).
    const group = newGroups.value[0]
    if (!group) return false
    return addInboxGroup(group)
  }

  function ignoreItems(items: MediaInboxNewItem[]) {
    inboxStore.ignorePaths(items.map((item) => item.path))
  }

  function ignoreGroup(group: MediaInboxNewGroup) {
    ignoreItems(group.items)
  }

  return {
    t,
    inboxStore,
    newItems,
    newGroups,
    lostItems,
    newCount,
    lostCount,
    badgeCount,
    openInbox,
    addInboxItems,
    addInboxGroup,
    addAllNew,
    ignoreItems,
    ignoreGroup,
  }
}
