import {ref, computed} from 'vue'
import {useRoute} from 'vue-router'
import {useI18n} from 'vue-i18n'
import isEmpty from 'lodash/isEmpty'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {typedApi} from '@/services/typedApi'
import {getFilterObject} from '@/services/formatUtils'
import {getSavedFilters} from '@/services/filterService'
import {getMediaTypeName} from '@/utils/mediaTypeI18n'
import {isImageMediaType} from '@/utils/mediaType'
import {normalizeSortBy} from '@/utils/mediaSortFilter'
import {normalizeItemsView} from '@/utils/itemsView'
import {
  parseGroupBySetting,
  getGroupByRequiredSort,
} from '@/utils/itemsGroupBy'
import type { FilterObject } from '@/types/common'
import type { MediaType } from '@/types/media'
import type { AssignedMeta, Meta, SavedFilter } from '@/types/stores'
import type {
  ItemsPageInitDeps,
  ItemsPageStoreUpdates,
  PageSettingData,
  PageSettingsRecord,
  UseItemsPageInitOptions,
} from '@/types/itemsPage'

export function useItemsPageInit({
  props,
  mediaType,
  meta,
}: UseItemsPageInitOptions) {
  const appStore = useAppStore()
  const itemsStore = useItemsStore()
  const {t} = useI18n()
  const route = useRoute()

  const isFiltersReady = ref(false)

  const ITEMS = computed(() => itemsStore)
  const ENV = computed(() => ITEMS.value.environment)
  const apiUrl = computed(() => appStore.localhost)

  const updatePageSetting = async (data: PageSettingData): Promise<void> => {
    await typedApi.putPageSetting({
      data,
      query: {
        tagId: props.tagId,
        mediaTypeId: props.mediaTypeId,
        metaId: props.metaId,
        tabId: props.tabId,
      },
    })
  }

  const buildTagPageFilter = (): FilterObject | null => {
    const index = ITEMS.value.filters.findIndex(
      (i) => String(i.param) === String(meta.value?.id) && i.lock == true
    )

    if (index >= 0) {
      return null
    }

    const metaIdParam = route.query.metaId ? String(route.query.metaId) : null
    return getFilterObject({
      param: metaIdParam,
      type: 'array',
      cond: 'in all',
      lock: true,
      val: [Number(props.tagId)],
    })
  }

  const fetchMeta = async (): Promise<Meta> => {
    const res = await typedApi.getMetaById(Number(props.metaId))
    return {...res.data}
  }

  const fetchMediaType = async (): Promise<MediaType> => {
    const res = await typedApi.getMediaTypeById(Number(props.mediaTypeId))
    return res.data
  }

  const fetchSavedFilterBundle = async () => {
    const res = await typedApi.postSavedFilterContext({
      name: null,
      mediaTypeId: ENV.value.media_type_id,
      metaId: ENV.value.meta_id,
      tagId: ENV.value.tag_id,
      tabId: ENV.value.tab_id,
    })

    const [savedFilter] = res.data
    if (isEmpty(savedFilter)) {
      return {filters: [] as FilterObject[], savedFilter: {} as SavedFilter}
    }

    return {
      filters: savedFilter.filters || [],
      savedFilter,
    }
  }

  const fetchPageSettings = async () => {
    const res = await typedApi.fetchPageSettings({
      tagId: props.tagId,
      mediaTypeId: props.mediaTypeId,
      metaId: props.metaId,
      tabId: props.tabId,
    })

    return {
      settings: res.data?.[0] || null,
      shouldLinkFilter: Boolean(res.data?.[1]),
    }
  }

  const fetchPinnedMeta = async (): Promise<AssignedMeta[]> => {
    if (props.items_type === 'media' && props.mediaTypeId) {
      const res = await typedApi.getAssignedMetaForMediaType(props.mediaTypeId)
      return res.data
    }
    if (props.items_type === 'tag' && props.metaId) {
      const res = await typedApi.getPinnedChildMeta(props.metaId)
      return res.data
    }
    return []
  }

  const applyPageSettings = (
    pageSettings: PageSettingsRecord | null,
    assigned: AssignedMeta[] = [],
  ): Partial<ItemsPageStoreUpdates> => {
    if (!pageSettings) {
      return {groupBy: 'none', groupByMetaId: null}
    }

    const vals = ['page', 'limit', 'size', 'view', 'sortBy', 'sortDir'] as const
    const updates: Partial<ItemsPageStoreUpdates> = {
      groupBy: 'none',
      groupByMetaId: null,
    }

    for (const i of vals) {
      let value = pageSettings[i]
      if (value === undefined || value === null) continue

      if (i === 'page' && Number(pageSettings.limit) === 101) {
        value = 1
      }

      if (i === 'sortBy') {
        value = normalizeSortBy(
          String(value),
          props.items_type,
          mediaType.value,
          'createdAt',
          assigned,
        )
      }

      updates[i] = value as never
    }

    const parsedGroupBy = parseGroupBySetting(pageSettings.firstChar)
    updates.groupBy = parsedGroupBy.groupBy
    updates.groupByMetaId = parsedGroupBy.groupBy === 'pinnedMeta'
      ? parsedGroupBy.metaId
      : null
    const requiredSort = getGroupByRequiredSort(parsedGroupBy.groupBy)
    const currentSort = String(updates.sortBy || '')
    if (
      parsedGroupBy.groupBy !== 'none'
      && (
        currentSort === 'shuffle'
        || (requiredSort != null && currentSort !== requiredSort)
      )
    ) {
      updates.sortBy = requiredSort || 'name'
      if (updates.sortDir == null) {
        updates.sortDir = parsedGroupBy.groupBy === 'firstLetter'
          || parsedGroupBy.groupBy === 'path'
          || parsedGroupBy.groupBy === 'diskRoot'
          || updates.sortBy === 'name'
          ? 'asc'
          : 'desc'
      }
    }

    return updates
  }

  const getFilters = async (): Promise<void> => {
    const {filters, savedFilter} = await fetchSavedFilterBundle()

    itemsStore.updateMultiple({
      filters,
      savedFilter,
    })

    if (props.tagId) {
      const tagFilter = buildTagPageFilter()
      if (tagFilter) {
        itemsStore.updateState({
          key: 'filters',
          value: [...ITEMS.value.filters, tagFilter],
        })
      }
    }

    itemsStore.updateState({key: 'isFiltersLoaded', value: true})
  }

  const getPinnedMeta = async (): Promise<void> => {
    const assigned = await fetchPinnedMeta()
    itemsStore.updateState({
      key: 'assigned',
      value: assigned,
    })
    isFiltersReady.value = true
  }

  const loadSavedFilters = (): void => {
    getSavedFilters().catch((error) => {
      console.error('Failed to load saved filters:', error)
    })
  }

  const init = async ({
    disposeListFetching,
    resetMediaListState: _resetMediaListState,
    getItemsFromDb,
  }: ItemsPageInitDeps): Promise<void> => {
    if (!apiUrl.value) {
      return
    }
    if (props.items_type === 'media' && !props.mediaTypeId) {
      return
    }
    if (props.items_type === 'tag' && !props.metaId) {
      return
    }

    disposeListFetching()
    isFiltersReady.value = false

    const storeUpdates: ItemsPageStoreUpdates = {
      type: props.items_type,
      isFiltersLoaded: false,
    }

    if (props.items_type === 'media' || props.items_type === 'tag') {
      Object.assign(storeUpdates, {
        itemsOnPage: [],
        entities: [],
        totalFiltered: 0,
      })
    }

    if (props.items_type === 'media') {
      Object.assign(storeUpdates, {
        navigationItems: [],
      })
    }

    if (props.items_type === 'tag') {
      const metaData = await fetchMeta()
      meta.value = metaData
      Object.assign(storeUpdates, {
        meta: metaData,
        name: metaData.name,
        icon: metaData.icon,
      })

      if (!props.tagId && metaData?.id) {
        await itemsStore.countViewNumber(metaData, 'meta')
      }
    } else if (props.items_type === 'media') {
      const mediaTypeData = await fetchMediaType()
      mediaType.value = mediaTypeData
      Object.assign(storeUpdates, {
        name: getMediaTypeName(mediaTypeData, t),
        icon: mediaTypeData.icon,
      })
    }

    const {filters, savedFilter} = await fetchSavedFilterBundle()
    Object.assign(storeUpdates, {filters, savedFilter})

    if (props.tagId) {
      const existingFilters = storeUpdates.filters || []
      const alreadyLocked = existingFilters.some(
        (i) => String(i.param) === String(meta.value?.id) && i.lock === true
      )

      if (!alreadyLocked) {
        const metaIdParam = route.query.metaId ? String(route.query.metaId) : null
        storeUpdates.filters = [
          ...existingFilters,
          getFilterObject({
            param: metaIdParam,
            type: 'array',
            cond: 'in all',
            lock: true,
            val: [Number(props.tagId)],
          }),
        ]
      }
    }

    const assigned = await fetchPinnedMeta()
    storeUpdates.assigned = assigned

    const {settings: pageSettings, shouldLinkFilter} = await fetchPageSettings()
    Object.assign(storeUpdates, applyPageSettings(pageSettings, assigned))

    const resolvedView = storeUpdates.view != null
      ? normalizeItemsView(
        storeUpdates.view,
        props.items_type === 'tag' ? 'tag' : 'media',
        mediaType.value,
      )
      : null

    if (resolvedView != null) {
      storeUpdates.view = resolvedView
    } else if (
      props.items_type === 'media' &&
      isImageMediaType(mediaType.value)
    ) {
      storeUpdates.view = 3
    }

    storeUpdates.isFiltersLoaded = true

    itemsStore.updateMultiple(storeUpdates)
    isFiltersReady.value = true

    if (
      resolvedView != null &&
      pageSettings?.view != null &&
      Number(pageSettings.view) !== resolvedView
    ) {
      await updatePageSetting({view: resolvedView})
    }

    if (
      props.items_type === 'media' &&
      pageSettings?.sortBy &&
      pageSettings.sortBy !== itemsStore.sortBy
    ) {
      await updatePageSetting({sortBy: itemsStore.sortBy})
    }

    if (shouldLinkFilter) {
      await updatePageSetting({filterId: ITEMS.value.savedFilter?.id})
    }

    await getItemsFromDb()
  }

  return {
    isFiltersReady,
    updatePageSetting,
    init,
    loadSavedFilters,
    getFilters,
    getPinnedMeta,
  }
}
