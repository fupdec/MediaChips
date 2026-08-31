import {computed, watch, onMounted, onBeforeUnmount, nextTick, ref} from 'vue'
import {useRouter} from 'vue-router'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {registerItemsPageCommands} from '@/composable/itemsPageCommands'
import {registerItemsListSync} from '@/composable/itemsListSync'
import {onMetaCatalogChanged} from '@/composable/metaCatalog'
import {typedApi} from '@/services/typedApi'
import {
  getDefaultMediaTypeId,
  isImageMediaType,
} from '@/utils/mediaType'
import {resolveOpenMediaKind} from '@/utils/openMediaKind'
import {openTextMedia} from '@/utils/openTextMedia'
import {resolveGalleryPlaylistVideos} from '@/utils/galleryPlaylist'
import {getDuplicatesGroupKey} from '@/utils/mediaSortFilter'
import type {
  GetItemsFromDbEvent,
  RemoveEntitiesEvent,
  UseItemsPageEventsOptions,
} from '@/types/itemsPage'
import type { SetItemsFiltersEvent } from '@shared/api/responses'
import type { MediaItem } from '@/types/stores'
import { normalizeEntityIds, normalizeRemoveEntitiesEvent } from '@/utils/eventPayloads'
import {
  getGroupByRequiredSort,
  isDateGroupSortField,
  isSortCompatibleWithGroupBy,
  normalizeItemsGroupBy,
  parseGroupBySetting,
  serializeGroupBySetting,
} from '@/utils/itemsGroupBy'
import {
  hasSavedViewLayout,
  parseSavedViewGroupBy,
  type SavedViewLayout,
} from '@/utils/savedViewLayout'

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

  const ITEMS = computed(() => itemsStore)
  let initPromise: Promise<void> | null = null
  let initGeneration = 0
  const pageInitialized = ref(false)
  const itemsRenderKey = ref(0)

  const runInitSafely = async (): Promise<void> => {
    const generation = ++initGeneration
    pageInitialized.value = false

    initPromise = (async () => {
      try {
        await init()
        if (generation !== initGeneration) return
        loadSavedFilters()
      } catch (error) {
        console.error('Failed to initialize items page:', error)
      } finally {
        if (generation === initGeneration) {
          loader.value.is_busy = false
          pageInitialized.value = true
          initPromise = null
        }
      }
    })()

    return initPromise
  }

  const handleGetItemsFromDb = (event: GetItemsFromDbEvent) => {
    const {ids, type, patch} = event
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

  const handleSetItemsFilters = async (event: SetItemsFiltersEvent) => {
    const val = event
    itemsStore.updateState({key: 'page', value: 1})
    await updatePageSetting({
      page: 1,
      query: val,
    })
    await getFilters()
    await getItemsFromDb()
  }

  const handleReloadItems = async () => {
    itemsStore.updateState({key: 'page', value: 1})
    await getItemsFromDb()
  }

  const handleSetItemsLimit = (event: number) => {
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

  const handleRemoveEntitiesFromState = (event: RemoveEntitiesEvent) => {
    const payload = normalizeRemoveEntitiesEvent(event)
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

  const handleSetItemsSortDir = (event: string) => {
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

  const handleSetItemsSortBy = (event: string) => {
    const sortBy = String(event)
    const pageSettingUpdates: Parameters<typeof updatePageSetting>[0] = {
      page: 1,
      sortBy,
    }

    const groupBy = normalizeItemsGroupBy(ITEMS.value.groupBy)
    if (groupBy !== 'none' && !isSortCompatibleWithGroupBy(groupBy, sortBy)) {
      itemsStore.updateMultiple({
        groupBy: 'none',
        groupByMetaId: null,
        groups: [],
      })
      pageSettingUpdates.firstChar = 'none'
    }

    itemsStore.updateState({
      key: 'page',
      value: 1,
    })
    void updatePageSetting(pageSettingUpdates)
    void getItemsFromDb()
  }

  const handleSetItemsView = (event: number | string) => {
    const val = event
    void updatePageSetting({
      view: val,
    })
  }

  const handleSetItemsGroupBy = (event: string) => {
    const parsed = parseGroupBySetting(event)
    const groupBy = parsed.groupBy
    const metaId = parsed.metaId
    const preferredSort = getGroupByRequiredSort(groupBy)
    const currentSort = String(ITEMS.value.sortBy || '')
    const isDateGroup = groupBy === 'dateMonth' || groupBy === 'dateYear' || groupBy === 'dateDay'
    const keepDateSort = isDateGroup && isDateGroupSortField(currentSort)
    const needsSortChange = groupBy !== 'none' && (
      currentSort === 'shuffle'
      || (preferredSort != null && currentSort !== preferredSort && !keepDateSort)
    )
    const sortToApply = keepDateSort
      ? currentSort
      : (preferredSort || (currentSort === 'shuffle' ? 'name' : null))

    itemsStore.updateMultiple({
      groupBy,
      groupByMetaId: groupBy === 'pinnedMeta' ? metaId : null,
      groups: [],
      page: 1,
    })

    const firstChar = serializeGroupBySetting(groupBy, metaId)

    if (needsSortChange && sortToApply) {
      const sortDir = groupBy === 'firstLetter' || groupBy === 'path' || groupBy === 'diskRoot'
        || sortToApply === 'name'
        ? 'asc'
        : 'desc'
      itemsStore.updateMultiple({
        sortBy: sortToApply,
        sortDir,
        page: 1,
      })
      void updatePageSetting({
        firstChar,
        sortBy: sortToApply,
        sortDir,
        page: 1,
      })
      void getItemsFromDb()
      return
    }

    void updatePageSetting({
      firstChar,
      page: 1,
    })
    void getItemsFromDb()
  }

  const handleApplySavedViewLayout = async (layout: SavedViewLayout) => {
    if (!hasSavedViewLayout(layout)) return

    const storeUpdates: Record<string, unknown> = {
      page: 1,
      groups: [],
    }
    const pageUpdates: Parameters<typeof updatePageSetting>[0] = {
      page: 1,
    }

    if (layout.size != null) {
      storeUpdates.size = Number(layout.size)
      pageUpdates.size = Number(layout.size)
    }
    if (layout.view != null) {
      storeUpdates.view = layout.view
      pageUpdates.view = layout.view
    }
    if (layout.sortBy) {
      storeUpdates.sortBy = layout.sortBy
      pageUpdates.sortBy = layout.sortBy
    }
    if (layout.sortDir) {
      storeUpdates.sortDir = layout.sortDir
      pageUpdates.sortDir = layout.sortDir
    }
    if (layout.groupBy != null) {
      const parsed = parseSavedViewGroupBy(layout)
      storeUpdates.groupBy = parsed.groupBy
      storeUpdates.groupByMetaId = parsed.groupByMetaId
      pageUpdates.firstChar = parsed.firstChar
    }
    // Always restore join mode from the saved view (defaults to AND).
    storeUpdates.filtersJoin = layout.filtersJoin === 'or' ? 'or' : 'and'

    itemsStore.updateMultiple(storeUpdates)
    await updatePageSetting(pageUpdates)
  }

  const handleUpdateAssignedMeta = async () => {
    await getPinnedMeta()
  }

  const handleGetMeta = () => {
    if (props.items_type !== 'tag' || !props.metaId) return

    void typedApi.getMetaById(Number(props.metaId))
      .then((res) => {
        meta.value = {...res.data}
        itemsStore.updateState({key: 'meta', value: res.data})
        itemsRenderKey.value += 1
      })
      .catch((error) => {
        console.error('Failed to refresh meta:', error)
      })
  }

  const handleOpenRandomItem = async (event: number) => {
    const id = Number(event)
    const navigationPool = ITEMS.value.navigationItems.length
      ? ITEMS.value.navigationItems
      : ITEMS.value.entities

    if (props.items_type === 'tag' && meta.value?.id) {
      const url = `/tag?metaId=${meta.value.id}&tagId=${id}&mediaTypeId=${getDefaultMediaTypeId(appStore.mediaTypes)}`
      void router.push(url)
    } else if (props.items_type === 'media') {
      let media = navigationPool.find((i) => i.id === id)
      if (!media) {
        // Random item picked from the full filtered set — fetch it from DB.
        try {
          const url = '/api/media/items'
          const res = await typedApi.postItemsList(url, {
            ids: [id],
            mediaTypeId: props.mediaTypeId,
            filters: [],
            limit: 1,
            skipTotals: true,
            includeNavigation: false,
          })
          media = res.data.items?.find((entry: MediaItem) => Number(entry.id) === Number(id))
        } catch {
          // If the fetch fails, just give up.
        }
      }
      if (!media) return
      const kind = resolveOpenMediaKind(mediaType.value, {path: media.path})
      if (kind === 'view-image') {
        itemsStore.viewImage({image: media})
      } else if (kind === 'play-av') {
        // The random target may not be in the in-memory gallery, so playVideo
        // would otherwise skip the full playlist and play it as a single item.
        // Resolve the entire filtered set and pass it explicitly.
        const mediaTypeId = ITEMS.value.environment.media_type_id ?? media.mediaTypeId
        const resolvedMediaType = appStore.mediaTypes?.find((item) => item.id === Number(mediaTypeId))
        const playlist = await resolveGalleryPlaylistVideos({
          type: ITEMS.value.type,
          mediaTypeId,
          filters: ITEMS.value.filters,
          filtersJoin: ITEMS.value.filtersJoin,
          sortBy: ITEMS.value.sortBy,
          sortDir: ITEMS.value.sortDir,
          find_duplicates: ITEMS.value.find_duplicates,
          duplicatesBy: getDuplicatesGroupKey(resolvedMediaType, ITEMS.value.duplicates_by),
          listScopeIds: ITEMS.value.listScopeIds,
          entities: ITEMS.value.entities,
          navigationItems: ITEMS.value.navigationItems,
          totalFiltered: ITEMS.value.totalFiltered,
        })
        itemsStore.playVideo({
          video: media,
          videos: playlist ?? undefined,
        })
      } else if (kind === 'preview-text' || kind === 'open-path') {
        openTextMedia(media)
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

  let unregisterPageCommands: (() => void) | null = null
  let unregisterListSync: (() => void) | null = null
  let unsubscribeMetaCatalog: (() => void) | null = null

  const bindEvents = (): void => {
    unregisterPageCommands = registerItemsPageCommands({
      setFilters: handleSetItemsFilters,
      reloadItems: handleReloadItems,
      setLimit: handleSetItemsLimit,
      setSortBy: handleSetItemsSortBy,
      setSortDir: handleSetItemsSortDir,
      setView: handleSetItemsView,
      setGroupBy: handleSetItemsGroupBy,
      applySavedViewLayout: handleApplySavedViewLayout,
      refreshAssignedMeta: handleUpdateAssignedMeta,
      refreshCurrentMeta: handleGetMeta,
      openRandomItem: handleOpenRandomItem,
    })
    unregisterListSync = registerItemsListSync({
      getItemsFromDb: handleGetItemsFromDb,
      removeEntitiesFromState: handleRemoveEntitiesFromState,
    })
    unsubscribeMetaCatalog = onMetaCatalogChanged(handleGetMeta)
  }

  const unbindEvents = (): void => {
    unregisterPageCommands?.()
    unregisterPageCommands = null
    unregisterListSync?.()
    unregisterListSync = null
    unsubscribeMetaCatalog?.()
    unsubscribeMetaCatalog = null
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
    itemsStore.duplicates_by = null

    unbindEvents()
  })

  watch(() => ITEMS.value.size, (val, old) => {
    if (val === old) return
    if (!pageInitialized.value) return
    void updatePageSetting({size: val})
  })

  watch(() => ITEMS.value.view, (val, old) => {
    if (val === old) return
    if (val == null) return
    if (!pageInitialized.value) return
    void updatePageSetting({view: val})
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

      itemsStore.updateMultiple({
        groupBy: 'none',
        groupByMetaId: null,
        groups: [],
      })
      itemsStore.clearSelection()
      itemsStore.listScopeIds = null
      itemsStore.listScope = null
      itemsStore.find_duplicates = false
      itemsStore.duplicates_by = null
      await runInitSafely()
    },
  )

  return {
    pageInitialized,
    itemsRenderKey,
  }
}
