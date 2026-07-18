<template>
  <v-container ref="container">

    <div class="text-md-h2 d-flex align-end justify-space-between flex-wrap my-6">
      <div class="d-flex align-baseline">
        <v-icon size="42" start>mdi-{{ ITEMS.icon }}</v-icon>
        {{ pageTitle }}
        <span v-if="!loader.is_busy && total > 0">
        <span v-if="total != totalInDb"
          class="text-h5 ml-2">
          ({{ total }} of {{ totalInDb }})
        </span>
        <span v-else
          class="text-h5 ml-2">({{ total }})</span>
        <span v-if="filesize_all"
          class="text-h6 ml-2">({{ filesize_all }})</span>
        </span>
      </div>

      <div class="d-flex align-end">
        <ToolbarSort></ToolbarSort>
        <ToolbarGroupBy></ToolbarGroupBy>

        <v-btn @click="toggleCustomization"
          v-tooltip:top="t('appbar.buttons.customize')"
          color="primary"
          variant="flat"
          icon>
          <v-icon>mdi-tune</v-icon>
        </v-btn>
      </div>
    </div>

    <v-expand-transition>
      <ToolbarAppearance v-if="toolbarStore.appearance.show"></ToolbarAppearance>
    </v-expand-transition>

    <SavedFilters v-if="pageInitialized && settingsStore.showSavedFilters == '1'"/>

    <!-- боковая панель -->
    <Filters v-if="pageInitialized" :isReady="isFiltersReady"/>

    <FiltersChips
      v-if="pageInitialized && (activeFilters.length > 0 || (ENV.media_type_id ? ITEMS.find_duplicates : false))"
      :filters="ITEMS.filters"
      class="my-4"
    />

    <Loading v-if="loader.is_busy"/>

    <ItemsPaginationBar
      v-if="showPagination"
      v-model:page="paginationPage"
      v-model:jump-page="jumpPageForPagination"
      :pages="pages"
      :total-visible="paginationTotalVisible"
      @change="changePage"
      @jump="jumpToPage"
    />

    <ItemsMasonryGrid
      v-if="pageInitialized && ITEMS.itemsOnPage.length && isMasonryGrid"
      :key="`masonry-${itemsRenderKey}`"
      :items="ITEMS.itemsOnPage"
      :items-type="listItemType"
      :meta="meta"
      :media-type="mediaType"
      :reg="reg"
      :size="ITEMS.size"
      :view="ITEMS.view"
      :gap-size="SETTINGS.gapSize"
      :grid-classes="itemsGridClasses"
      :grid-layout-options="itemsGridLayoutOptions"
      :virtual="useVirtualMasonry"
      class="items-page-grid"
    />

    <ItemsVirtualGrid
      v-else-if="pageInitialized && ITEMS.itemsOnPage.length && useVirtualGrid"
      :key="`virtual-${itemsRenderKey}`"
      :items="ITEMS.itemsOnPage"
      :items-type="listItemType"
      :meta="meta"
      :media-type="mediaType"
      :reg="reg"
      :size="ITEMS.size"
      :view="ITEMS.view"
      :gap-size="SETTINGS.gapSize"
      :grid-classes="itemsGridClasses"
      :grid-layout-options="itemsGridLayoutOptions"
      :image-grid="isImageGrid"
      :wide-image="isWideImage"
      :line-grid="isLineGrid"
      :chips-grid="isChipsGrid"
      :image-aspect-ratio="tagImageAspectRatio"
      class="items-page-grid"
    />

    <div
      v-else-if="pageInitialized && ITEMS.itemsOnPage.length"
      :key="`grid-${itemsRenderKey}`"
      ref="itemsGridRef"
      :class="itemsGridClasses"
      :style="itemsGridStyle"
      class="items-page-grid"
    >
      <template v-if="groupedSections">
        <template v-for="section in groupedSections" :key="section.key">
          <div class="items-group-header">
            <span class="items-group-header__label">{{ section.label }}</span>
            <span class="items-group-header__count">{{ section.count ?? section.items.length }}</span>
            <button
              v-if="canOpenGroupFilter(section)"
              type="button"
              class="items-group-header__action"
              @click.stop="openGroupFilter(section)"
            >
              <v-icon size="18">mdi-filter-outline</v-icon>
              <span>{{ t('items.group_by_filter_action') }}</span>
            </button>
          </div>
          <Item
            v-for="(i, x) in section.items"
            v-memo="[i.id, i.name, i.bookmark, i.time, i.views, i.viewedAt, i.favorite, i.rating, i.thumb, i.tags, i.values, ITEMS.size, ITEMS.view, listItemType, itemsRenderKey]"
            :key="String(i.id)"
            :type="listItemType"
            :item="i"
            :meta="meta"
            :media-type="mediaType"
            :reg="reg"
            :x="x"
          />
        </template>
      </template>
      <template v-else>
        <Item
          v-for="(i, x) in ITEMS.itemsOnPage"
          v-memo="[i.id, i.name, i.bookmark, i.time, i.views, i.viewedAt, i.favorite, i.rating, i.thumb, i.tags, i.values, ITEMS.size, ITEMS.view, listItemType, itemsRenderKey]"
          :key="String(i.id)"
          :type="listItemType"
          :item="i"
          :meta="meta"
          :media-type="mediaType"
          :reg="reg"
          :x="x"
        />
      </template>
    </div>

    <div
      v-if="pageInitialized && ITEMS.itemsOnPage.length && infiniteScrollReachedEnd"
      class="scroll-top-after-items"
    >
      <v-btn
        @click="scrollTop"
        color="primary"
        rounded
        variant="outlined"
      >
        <v-icon left>mdi-format-vertical-align-top</v-icon>
        {{ t('items.scroll_to_top') }}
      </v-btn>
    </div>

    <ItemsPaginationBar
      v-if="showPagination"
      v-model:page="paginationPage"
      v-model:jump-page="jumpPageForPagination"
      :pages="pages"
      :total-visible="paginationTotalVisible"
      @change="changePage"
      @jump="jumpToPage"
    />

    <div v-if="pageInitialized && 0 == total && total == totalInDb"
      class="layout-img">
      <v-img src="/images/no-data.svg"
        max-height="40vh"
        class="my-4"
        contain></v-img>
      <div class="text-medium-emphasish">{{ t('empty_states.no_items_add_first') }}</div>
      <div class="mt-4 d-flex justify-center">
        <DialogMediaAdding
          v-if="items_type === 'media'"
          button-color="success"
          button-size="large"
          button-variant="flat"
        />
        <TagsAdd
          v-else-if="items_type === 'tag'"
          :meta_id="metaId"
          button-color="success"
          button-size="large"
          button-variant="flat"
        />
      </div>
    </div>

    <div v-if="pageInitialized && 0 == total && total !== totalInDb"
      class="layout-img">
      <v-img :src="image_filters_no_results"
        max-height="40vh"
        class="my-4"
        contain></v-img>
      <div class="text-medium-emphasis">There is no items matching the filters
      </div>
    </div>

    <div
      v-if="pageInitialized && ITEMS.itemsOnPage.length && infiniteScrollHasMore"
      class="infinite-loader-full-height"
    >
      <Loading v-if="isLoadingMore" />

      <div
        v-intersect="infiniteIntersectOptions"
        class="infinite-scroll-sentinel"
        aria-hidden="true"
      />
    </div>

    <QuickActionButton v-if="SETTINGS.show_quick_action_button == '1'"/>
  </v-container>
</template>

<script setup lang="ts">
import {ref, computed, watch, onBeforeUnmount} from 'vue'
import {useDisplay} from 'vuetify'
import {useI18n} from 'vue-i18n'
import {useItemsStore} from '@/stores/items'
import {useSettingsStore} from '@/stores/settings'
import {useRegistrationStore} from '@/stores/registration'
import {useToolbarStore} from '@/stores/toolbar'
import {useAppStore} from '@/stores/app'
import {useItemsPage} from '@/composable/useItemsPage'
import {useItemsPageInit} from '@/composable/useItemsPageInit'
import {useItemsPageEvents} from '@/composable/useItemsPageEvents'
import useVideoImageGenerator from '@/composable/GeneratingThumbsForVideos'
import type {ItemsPageProps, ItemsPageType} from '@/types/itemsPage'
import type {MediaType} from '@/types/media'
import type {Meta} from '@/types/stores'

// Компоненты
import Item from '@/components/items/Item.vue'
import ItemsVirtualGrid from '@/components/items/ItemsVirtualGrid.vue'
import ItemsMasonryGrid from '@/components/items/ItemsMasonryGrid.vue'
import Filters from '@/components/app/Filters.vue'
import SavedFilters from '@/components/elements/FiltersSaved.vue'
import FiltersChips from '@/components/elements/FiltersChips.vue'
import Loading from '@/components/elements/Loading.vue'
import ItemsPaginationBar from '@/components/elements/ItemsPaginationBar.vue'
import QuickActionButton from '@/components/app/QuickActionButton.vue'
import ToolbarSort from '@/components/app/toolbar/ToolbarSort.vue'
import ToolbarGroupBy from '@/components/app/toolbar/ToolbarGroupBy.vue'
import ToolbarAppearance from "@/components/app/toolbar/ToolbarAppearance.vue";
import DialogMediaAdding from '@/components/dialogs/DialogMediaAdding.vue'
import TagsAdd from '@/components/app/appbar/elements/TagsAdd.vue'
import {getMediaTypeName} from '@/utils/mediaTypeI18n'
import {isVideoMediaType, isImageMediaType} from '@/utils/mediaType'
import {getReadableFileSize} from '@/services/formatUtils'
import {useItemsThumbPrefetch} from '@/composable/useItemsThumbPrefetch'
import {useResponsiveGridLayout} from '@/composable/useResponsiveGridLayout'
import {shouldUseVirtualGrid, shouldUseVirtualMasonry} from '@/utils/gridLayout'
import {clearVisibleItemIds} from '@/utils/visibleItemsWindow'
import {resetVisibilityObserver} from '@/utils/sharedVisibilityObserver'
import {
  buildItemGroups,
  getGroupKeyAndLabel,
  resolveActiveItemsGroupBy,
  type ItemsGroupSection,
} from '@/utils/itemsGroupBy'
import {getFilterObject} from '@/services/formatUtils'
import {useEventBus} from '@/utils/eventBus'
import type { MediaItem } from '@/types/stores'

// Пропсы
const props = defineProps<ItemsPageProps>()

// Сторы Pinia
const itemsStore = useItemsStore()
const settingsStore = useSettingsStore()
const toolbarStore = useToolbarStore()
const registrationStore = useRegistrationStore()
const appStore = useAppStore()
const eventBus = useEventBus()
const {t, locale} = useI18n()

// Константы из Vuetify
const {xs} = useDisplay()

// Запускает watcher генерации превью в composable
useVideoImageGenerator()

// Реактивные переменные
const mediaType = ref<MediaType | null>(null)
const meta = ref<Meta | null>(null)
const container = ref<HTMLElement | null>(null)
const itemsGridRef = ref<HTMLElement | null>(null)

const {
  isFiltersReady,
  updatePageSetting,
  init: runInit,
  loadSavedFilters,
  getFilters,
  getPinnedMeta,
} = useItemsPageInit({
  props,
  mediaType,
  meta,
})

const {
  total,
  totalInDb,
  pages,
  loader,
  isLoadingMore,
  infiniteScrollExhausted,
  is_infinite_scroll,
  showPagination,
  paginationPage,
  paginationJumpPage,
  infiniteIntersectOptions,
  getItemsFromDb,
  getEntitiesOnPage,
  changePage,
  jumpToPage,
  scrollTop,
  resetMediaListState,
  disposeListFetching,
  bindMediaInfiniteScroll,
  unbindMediaInfiniteScroll,
  maybeLoadMoreIfNearBottom,
  refreshScrollRoot,
  loadNextInfinitePage,
} = useItemsPage({
  props,
  mediaType,
  container,
  updatePageSetting,
})

const infiniteScrollHasMore = computed(() => (
  is_infinite_scroll.value
  && itemsStore.totalFiltered > 0
  && !infiniteScrollExhausted.value
  && itemsStore.itemsOnPage.length < itemsStore.totalFiltered
))

const infiniteScrollReachedEnd = computed(() => (
  is_infinite_scroll.value
  && itemsStore.totalFiltered > 0
  && (infiniteScrollExhausted.value || itemsStore.itemsOnPage.length >= itemsStore.totalFiltered)
))

const init = () => runInit({
  disposeListFetching,
  resetMediaListState,
  getItemsFromDb,
})

const {pageInitialized, itemsRenderKey} = useItemsPageEvents({
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
})

// Компьютеды
const ITEMS = computed(() => itemsStore)
const SETTINGS = computed(() => settingsStore)
const activeFilters = computed(() => {
  if (!ITEMS.value.filters || !Array.isArray(ITEMS.value.filters)) {
    return [];
  }
  return ITEMS.value.filters.filter(i => i && i.active);
});
const isImageGrid = computed(() =>
  props.items_type === 'media' && mediaType.value?.type === 'image' && ITEMS.value.view == 1
)
const isMasonryGrid = computed(() =>
  props.items_type === 'media' && mediaType.value?.type === 'image' && ITEMS.value.view == 3
)
const isWideImage = computed(() =>
  props.items_type === 'media' && isVideoMediaType(mediaType.value) && ITEMS.value.view == 2
)
const isLineGrid = computed(() => isWideImage.value)
const isChipsGrid = computed(() =>
  props.items_type === 'tag' && ITEMS.value.view == 2
)
const tagImageAspectRatio = computed(() => {
  const ratio = Number(meta.value?.imageAspectRatio)
  return Number.isFinite(ratio) && ratio > 0 ? ratio : undefined
})
const listItemType = computed((): ItemsPageType =>
  props.items_type === 'tag' ? 'tag' : 'media',
)
const useVirtualGrid = computed(() =>
  shouldUseVirtualGrid(
    ITEMS.value.itemsOnPage.length,
    is_infinite_scroll.value,
    listItemType.value,
  ),
)
const useVirtualMasonry = computed(() =>
  shouldUseVirtualMasonry(
    ITEMS.value.itemsOnPage.length,
    is_infinite_scroll.value,
    listItemType.value,
  ),
)

const groupedSections = computed(() => {
  if (isMasonryGrid.value) return null
  const groupBy = resolveActiveItemsGroupBy(
    ITEMS.value.groupBy,
    ITEMS.value.sortBy,
    listItemType.value,
  )
  if (groupBy === 'none') return null

  const metaId = Number(ITEMS.value.groupByMetaId)
  const usePinnedMetaId = listItemType.value === 'tag'
  const assigned = ITEMS.value.sortedAssigned.find((row) => {
    const rowMetaId = Number(
      usePinnedMetaId
        ? (row.pinnedMetaId ?? row.meta?.id)
        : (row.metaId ?? row.meta?.id),
    )
    return rowMetaId === metaId
  })
  const tagsById = new Map(appStore.tags.map((tag) => [Number(tag.id), tag.name || '']))
  const options = {
    locale: locale.value,
    t: (key: string, params?: Record<string, string | number>) => t(key, params),
    metaId: Number.isFinite(metaId) ? metaId : null,
    metaType: assigned?.meta?.type || null,
    direction: ITEMS.value.sortDir || 'asc',
    resolveTagName: (tagId: number) => tagsById.get(Number(tagId)) || `#${tagId}`,
  }

  const serverGroups = ITEMS.value.groups || []
  if (serverGroups.length) {
    const itemsByKey = new Map<string, MediaItem[]>()
    for (const item of ITEMS.value.itemsOnPage) {
      const {key} = getGroupKeyAndLabel(item, groupBy, ITEMS.value.sortBy, options)
      const list = itemsByKey.get(key) || []
      list.push(item)
      itemsByKey.set(key, list)
    }

    const sections: ItemsGroupSection<MediaItem>[] = []
    for (const group of serverGroups) {
      const items = itemsByKey.get(group.key)
      if (!items?.length) continue
      const localized = getGroupKeyAndLabel(items[0], groupBy, ITEMS.value.sortBy, options)
      sections.push({
        key: group.key,
        label: localized.label || group.label,
        items,
        count: group.count,
        filter: group.filter ?? localized.filter ?? null,
      })
    }
    if (sections.length) return sections
  }

  // Fallback when server groups are missing or keys don't match page items.
  const fallback = buildItemGroups(
    ITEMS.value.itemsOnPage,
    groupBy,
    ITEMS.value.sortBy,
    options,
  )
  return fallback.length ? fallback : null
})

const canFilterPinnedMetaGroups = computed(() =>
  resolveActiveItemsGroupBy(
    ITEMS.value.groupBy,
    ITEMS.value.sortBy,
    listItemType.value,
  ) === 'pinnedMeta',
)

const canOpenGroupFilter = (section: ItemsGroupSection<MediaItem>) => {
  if (!canFilterPinnedMetaGroups.value || !section.filter) return false
  if (section.filter.tagIds) return true
  if (section.key === '#') return true
  return section.filter.value != null
}

const openGroupFilter = (section: ItemsGroupSection<MediaItem>) => {
  if (!canOpenGroupFilter(section) || !section.filter) return

  const {metaId, type, tagIds, value} = section.filter
  let filter

  if (type === 'array' || type === 'select' || tagIds) {
    if (section.key === '#' || !tagIds?.length) {
      filter = getFilterObject({
        param: metaId,
        type: 'array',
        cond: 'is null',
        val: null,
      })
    } else {
      filter = getFilterObject({
        param: metaId,
        type: 'array',
        cond: 'in all',
        val: tagIds,
      })
    }
  } else if (section.key === '#' || value == null || value === '') {
    filter = getFilterObject({
      param: metaId,
      type: type || 'string',
      cond: 'is null',
      val: null,
    })
  } else {
    filter = getFilterObject({
      param: metaId,
      type: type || 'string',
      cond: 'like',
      val: String(value),
    })
  }

  itemsStore.updateMultiple({
    filters: [...ITEMS.value.filters, filter],
    groupBy: 'none',
    groupByMetaId: null,
    groups: [],
    page: 1,
  })
  eventBus.emit('setItemsGroupBy', 'none')
  // Let Filters.vue sync store → local filters before apply (same pattern as ItemPinnedMeta).
  setTimeout(() => {
    eventBus.emit('applyFilters')
  }, 0)
}

onBeforeUnmount(() => {
  clearVisibleItemIds()
  resetVisibilityObserver()
})
const itemsGridClasses = computed(() => [
  `item__size-${ITEMS.value.size}`,
  `gap-size-${SETTINGS.value.gapSize}`,
  {'card-grid': ITEMS.value.view == 1},
  {'chips-grid': isChipsGrid.value},
  {'line-grid': isLineGrid.value},
  {'wide-image': isWideImage.value},
  {'image-grid': isImageGrid.value},
  {'masonry-grid': isMasonryGrid.value},
])
const itemsGridLayoutOptions = computed(() => ({
  size: ITEMS.value.size,
  gapSize: SETTINGS.value.gapSize,
  imageGrid: isImageGrid.value || isMasonryGrid.value,
  wideImage: isWideImage.value,
  lineGrid: isLineGrid.value,
  chipsGrid: isChipsGrid.value,
  imageAspectRatio: tagImageAspectRatio.value,
}))
const { gridStyle: itemsGridStyle } = useResponsiveGridLayout(itemsGridRef, itemsGridLayoutOptions)
const reg = computed(() => registrationStore.reg)
const ENV = computed(() => ITEMS.value.environment)

useItemsThumbPrefetch({
  items: computed(() => ITEMS.value.itemsOnPage),
  itemsType: listItemType,
  mediaType,
  metaId: computed(() => props.metaId),
})

const jumpPageForPagination = computed({
  get: (): number | undefined => paginationJumpPage.value ?? undefined,
  set: (value: number | undefined) => {
    paginationJumpPage.value = value ?? null
  },
})

const paginationTotalVisible = computed(() =>
  xs.value ? 5 : Number(SETTINGS.value.numberOfPagesLimit) || 7,
)

const filesize_all = computed(() => {
  if (props.items_type !== 'media') return ""
  const sum = ITEMS.value.totalFilesize
  if (!sum) return ""
  return getReadableFileSize(sum)
})

const pageTitle = computed(() => {
  if (props.items_type === 'media' && mediaType.value) {
    return getMediaTypeName(mediaType.value, t)
  }
  return ITEMS.value.name
})

const image_filters_no_results = computed(() => {
  let img_path = ''
  if (props.items_type === 'tag') {
    img_path = '/images/filters/filters-no-results-tag.svg';
  } else if (props.items_type === 'media') {
    img_path = '/images/filters/filters-no-results-file.svg';
    if (isVideoMediaType(mediaType.value)) {
      img_path = '/images/filters/filters-no-results-video.svg';
    } else if (isImageMediaType(mediaType.value)) {
      img_path = '/images/filters/filters-no-results-file.svg';
    }
  }
  return img_path;
})

// Методы
const toggleCustomization = () => {
  const toolbarStore = useToolbarStore()
  toolbarStore.appearance.show = !toolbarStore.appearance.show
}

defineEmits<{
  addMedia: []
  playVideo: [payload: unknown]
}>()
</script>

<style lang="scss">
.items-page-grid:not(.items-virtual-grid) :deep(.item) {
  content-visibility: auto;
  contain-intrinsic-size: auto 280px;
}

.items-group-header {
  flex: 0 0 100%;
  width: 100%;
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 12px 4px 4px;
  margin-top: 8px;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  box-sizing: border-box;
}

.items-group-header:first-child {
  margin-top: 0;
  padding-top: 4px;
}

.items-group-header__label {
  font-size: 1.125rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 1.2;
}

.items-group-header__count {
  font-size: 0.75rem;
  opacity: 0.6;
}

.items-group-header__action {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.8125rem;
  line-height: 1.2;
  opacity: 0.7;
  cursor: pointer;
}

.items-group-header__action:hover {
  opacity: 1;
}

.items-group-hint {
  flex: 0 0 100%;
  width: 100%;
  font-size: 0.8125rem;
  opacity: 0.7;
  padding: 0 4px 8px;
}

.infinite-loader-full-height {
  text-align: center;
  padding: 24px 0;
}

.scroll-top-after-items {
  display: flex;
  justify-content: center;
  padding: 60px 0 24px;
}

.infinite-scroll-sentinel {
  width: 100%;
  height: 1px;
  pointer-events: none;
}
</style>