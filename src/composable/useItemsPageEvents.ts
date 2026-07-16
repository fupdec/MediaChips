import {computed, watch, onMounted, onBeforeUnmount, nextTick, ref} from 'vue'
import type { Handler } from 'mitt'
import {useRouter} from 'vue-router'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useEventBus} from '@/utils/eventBus'
import {typedApi} from '@/services/typedApi'
import {
  getDefaultMediaTypeId,
  isAudioMediaType,
  isImageMediaType,
  isTextMediaType,
  isVideoMediaType,
} from '@/utils/mediaType'
import {openPath} from '@/services/shellService'
import type {
  GetItemsFromDbEvent,
  RemoveEntitiesEvent,
  UseItemsPageEventsOptions,
} from '@/types/itemsPage'
import type { MediaItem } from '@/types/stores'
import { normalizeEntityIds, normalizeRemoveEntitiesEvent } from '@/utils/eventPayloads'

export function useItemsPageEvents({
  props,
  mediaType,
  meta,
  loader,
  total,
  totalInDb,
  is_infinite_scroll,
  init,
  loadSavedFilters,
  updatePageSetting,
  getFilters,
  getPinnedMeta,
  getItemsFromDb,
  getEntitiesOnPage,
  bindMediaInfiniteScroll,
  unbindMediaInfiniteScroll,
  disposeListFetching,
  maybeLoadMoreIfNearBottom,
  refreshScrollRoot,
  loadNextInfinitePage,
}: UseItemsPageEventsOptions) {
  const itemsStore = useItemsStore()
  const appStore = useAppStore()
  const router = useRouter()
  const eventBus = useEventBus()

  const ITEMS = computed(() => itemsStore)
  let initPromise: Promise<void> | null = null
  const pageInitialized = ref(false)

  const runInitSafely = async (): Promise<void> => {
    if (initPromise) {
      return initPromise
    }

    pageInitialized.value = false

    initPromise = (async () => {
      try {
        await init()
        loadSavedFilters()
      } catch (error) {
        console.error('Failed to initialize items page:', error)
      } finally {
        loader.value.is_busy = false
        pageInitialized.value = true
        initPromise = null
      }
    })()

    return initPromise
  }

  const handleGetItemsFromDb: Handler = (event) => {
    const {ids, type, patch} = event as GetItemsFromDbEvent
    if (props.items_type !== type) return
    const normalizedIds = normalizeEntityIds(ids)
    if (Array.isArray(normalizedIds) && normalizedIds.length === 0 && loader.value.is_busy) {
      return
    }

    // Apply optimistic patch so cards update immediately (e.g. watched time),
    // then refetch from DB for the full item payload.
    if (patch && normalizedIds?.length) {
      for (const id of normalizedIds) {
        itemsStore.updateItem({id, item: patch as Partial<MediaItem>})
      }
    }

    void getItemsFromDb(normalizedIds)
  }

  const handleSetItemsFilters: Handler = async (event) => {
    const val = event
    itemsStore.updateState({key: 'page', value: 1})
    await updatePageSetting({
      page: 1,
      query: val,
    })
    await getFilters()
    await getItemsFromDb()
  }

  const handleSetItemsLimit: Handler = (event) => {
    const val = Number(event)
    itemsStore.updateState({
      key: 'page',
      value: 1,
    })
    if (val == 101) itemsStore.updateState({key: 'itemsOnPage', value: []})
    void updatePageSetting({
      page: 1,
      limit: val,
    })

    void getItemsFromDb()
  }

  const handleRemoveEntitiesFromState: Handler = (event) => {
    const payload = normalizeRemoveEntitiesEvent(event as RemoveEntitiesEvent)
    if (!payload) return
    const {ids, type} = payload
    if (type !== props.items_type) return

    if (props.items_type === 'media' || props.items_type === 'tag') {
      for (const id of ids) {
        itemsStore.removeItem(id)
      }
      total.value = ITEMS.value.totalFiltered
      totalInDb.value = Math.max(0, totalInDb.value - ids.length)
      return
    }

    getEntitiesOnPage(ids)
  }

  const handleSetItemsSortDir: Handler = (event) => {
    itemsStore.updateState({
      key: 'page',
      value: 1,
    })
    void updatePageSetting({
      page: 1,
      sortDir: String(event),
    })
    void getItemsFromDb()
  }

  const handleSetItemsSortBy: Handler = (event) => {
    itemsStore.updateState({
      key: 'page',
      value: 1,
    })
    void updatePageSetting({
      page: 1,
      sortBy: String(event),
    })
    void getItemsFromDb()
  }

  const handleSetItemsView: Handler = (event) => {
    const val = event
    void updatePageSetting({
      view: val as number | string,
    })
  }

  const handleUpdateAssignedMeta: Handler = async () => {
    await getPinnedMeta()
  }

  const handleGetMeta: Handler = () => {
    if (props.items_type !== 'tag' || !props.metaId) return

    void typedApi.getMetaById(Number(props.metaId))
      .then((res) => {
        meta.value = {...res.data}
        itemsStore.updateState({key: 'meta', value: res.data})
      })
      .catch((error) => {
        console.error('Failed to refresh meta:', error)
      })
  }

  const handleOpenRandomItem: Handler = (event) => {
    const id = Number(event)
    const navigationPool = ITEMS.value.navigationItems.length
      ? ITEMS.value.navigationItems
      : ITEMS.value.entities

    if (props.items_type === 'tag' && meta.value?.id) {
      const url = `/tag?metaId=${meta.value.id}&tagId=${id}&mediaTypeId=${getDefaultMediaTypeId(appStore.mediaTypes)}`
      void router.push(url)
    } else if (props.items_type === 'media') {
      const media = navigationPool.find((i) => i.id === id)
      if (!media) return
      if (isImageMediaType(mediaType.value)) {
        itemsStore.viewImage({image: media})
      } else if (isVideoMediaType(mediaType.value) || isAudioMediaType(mediaType.value)) {
        itemsStore.playVideo({
          video: media,
        })
      } else if (isTextMediaType(mediaType.value) && media?.path) {
        void openPath(media.path)
      }
    }
  }

  const loadMoreForViewer = async (): Promise<boolean> => {
    if (!is_infinite_scroll.value) return false
    if (props.items_type !== 'media') return false
    if (!isImageMediaType(mediaType.value)) return false
    if (ITEMS.value.itemsOnPage.length >= ITEMS.value.totalFiltered) return false

    const previousCount = ITEMS.value.itemsOnPage.length
    await loadNextInfinitePage()
    return ITEMS.value.itemsOnPage.length > previousCount
  }

  const eventHandlers: Array<[string, Handler]> = [
    ['getItemsFromDb', handleGetItemsFromDb],
    ['setItemsFilters', handleSetItemsFilters],
    ['setItemsLimit', handleSetItemsLimit],
    ['removeEntitiesFromState', handleRemoveEntitiesFromState],
    ['setItemsSortDir', handleSetItemsSortDir],
    ['setItemsSortBy', handleSetItemsSortBy],
    ['setItemsView', handleSetItemsView],
    ['updateAssignedMeta', handleUpdateAssignedMeta],
    ['getMeta', handleGetMeta],
    ['openRandomItem', handleOpenRandomItem],
  ]

  const bindEvents = (): void => {
    for (const [name, handler] of eventHandlers) {
      eventBus.on(name, handler)
    }
  }

  const unbindEvents = (): void => {
    for (const [name, handler] of eventHandlers) {
      eventBus.off(name, handler)
    }
  }

  onMounted(async () => {
    itemsStore.updateState({key: 'isSelect', value: false})
    itemsStore.updateState({key: 'selection', value: []})

    if (ITEMS.value.limit === 101) {
      itemsStore.updateState({key: 'page', value: 1})
    }

    bindEvents()

    await nextTick()
    await nextTick()
    await runInitSafely()

    refreshScrollRoot()

    if (is_infinite_scroll.value) {
      await nextTick()
      maybeLoadMoreIfNearBottom()
    }

    bindMediaInfiniteScroll()
    itemsStore.registerViewerLoadMoreHandler(loadMoreForViewer)
  })

  onBeforeUnmount(() => {
    itemsStore.registerViewerLoadMoreHandler(null)
    pageInitialized.value = false
    disposeListFetching()
    unbindMediaInfiniteScroll()
    if (is_infinite_scroll.value) void updatePageSetting({page: 1})
    itemsStore.updateState({
      key: 'isFiltersLoaded',
      value: false,
    })

    itemsStore.find_duplicates = false

    unbindEvents()
  })

  watch(() => ITEMS.value.size, (val, old) => {
    if (val === old) return
    void updatePageSetting({size: val})
  })

  watch(is_infinite_scroll, () => {
    bindMediaInfiniteScroll()
  })

  watch(
    () => [props.items_type, props.mediaTypeId, props.metaId, props.tagId, props.tabId],
    async (next, prev) => {
      if (!prev) return
      if (JSON.stringify(next) === JSON.stringify(prev)) return
      if (props.items_type === 'media' && !props.mediaTypeId) return
      if (props.items_type === 'tag' && !props.metaId) return

      itemsStore.clearSelection()
      await runInitSafely()
    },
  )

  return {
    pageInitialized,
  }
}
