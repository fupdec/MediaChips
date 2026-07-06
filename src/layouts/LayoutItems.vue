<template>
  <v-container @dragover="showDrop"
    ref="container">

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
      ref="itemsGridRef"
      :class="itemsGridClasses"
      :style="itemsGridStyle"
      class="items-page-grid"
    >
      <Item
        v-for="(i, x) in ITEMS.itemsOnPage"
        v-memo="[i, ITEMS.size, ITEMS.view, listItemType]"
        :key="String(i.id)"
        :type="listItemType"
        :item="i"
        :meta="meta"
        :media-type="mediaType"
        :reg="reg"
        :x="x"
      />
    </div>

    <div
      v-if="pageInitialized && ITEMS.itemsOnPage.length && is_infinite_scroll && ITEMS.itemsOnPage.length >= ITEMS.totalFiltered && ITEMS.totalFiltered > 0"
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
      v-if="pageInitialized && ITEMS.itemsOnPage.length && is_infinite_scroll && ITEMS.itemsOnPage.length < ITEMS.totalFiltered"
      class="infinite-loader-full-height"
    >
      <Loading v-if="isLoadingMore" />

      <div
        v-intersect="infiniteIntersectOptions"
        class="infinite-scroll-sentinel"
        aria-hidden="true"
      />
    </div>

    <Teleport to="#main-drop-target">
      <div
        v-show="dropzone"
        @dragleave="onDropzoneDragLeave"
        @drop.prevent="catchDrop($event)"
        @dragenter.prevent="onDropzoneDragEnter"
        @dragover.prevent="onDropzoneDragOver"
        class="dropzone"
      >
        <div class="text">{{ t('items.drop_video_or_folder') }}</div>
      </div>
    </Teleport>

    <QuickActionButton v-if="SETTINGS.show_quick_action_button == '1'"/>
  </v-container>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, onBeforeUnmount} from 'vue'
import {useDisplay} from 'vuetify'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useSettingsStore} from '@/stores/settings'
import {useTasksStore} from '@/stores/tasks'
import {useRegistrationStore} from '@/stores/registration'
import {useToolbarStore} from '@/stores/toolbar'
import {useEventBus} from '@/utils/eventBus'
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
import ToolbarAppearance from "@/components/app/toolbar/ToolbarAppearance.vue";
import DialogMediaAdding from '@/components/dialogs/DialogMediaAdding.vue'
import TagsAdd from '@/components/app/appbar/elements/TagsAdd.vue'
import {getMediaTypeName} from '@/utils/mediaTypeI18n'
import {isVideoMediaType, isImageMediaType} from '@/utils/mediaType'
import {getReadableFileSize} from '@/services/formatUtils'
import {collectDroppedPaths, startDroppedMediaAdding} from '@/utils/mediaDrop'
import {useItemsThumbPrefetch} from '@/composable/useItemsThumbPrefetch'
import {useResponsiveGridLayout} from '@/composable/useResponsiveGridLayout'
import {shouldUseVirtualGrid, shouldUseVirtualMasonry} from '@/utils/gridLayout'

// Пропсы
const props = defineProps<ItemsPageProps>()

// Сторы Pinia
const appStore = useAppStore()
const itemsStore = useItemsStore()
const settingsStore = useSettingsStore()
const tasksStore = useTasksStore()
const toolbarStore = useToolbarStore()
const registrationStore = useRegistrationStore()

const eventBus = useEventBus()
const {t} = useI18n()

// Константы из Vuetify
const {xs} = useDisplay()

// Запускает watcher генерации превью в composable
useVideoImageGenerator()

// Реактивные переменные
const mediaType = ref<MediaType | null>(null)
const meta = ref<Meta | null>(null)
const dropzone = ref(false)
const dropzoneDragDepth = ref(0)
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

const init = () => runInit({
  disposeListFetching,
  resetMediaListState,
  getItemsFromDb,
})

const {pageInitialized} = useItemsPageEvents({
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
const isElectron = computed(() => appStore.isElectron)
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

const containsDroppedFiles = (event: DragEvent) =>
  Array.from(event?.dataTransfer?.types || []).includes('Files')

const showDrop = (e: DragEvent) => {
  if (!containsDroppedFiles(e)) return

  e.preventDefault()
  if (isElectron.value && props.items_type === 'media') {
    dropzone.value = true
  }
}

const onDropzoneDragEnter = (event: DragEvent) => {
  if (!containsDroppedFiles(event)) return
  dropzoneDragDepth.value += 1
  dropzone.value = true
}

const onDropzoneDragOver = (event: DragEvent) => {
  if (!containsDroppedFiles(event)) return
  event.preventDefault()
  dropzone.value = true
}

const onDropzoneDragLeave = (event: DragEvent) => {
  const relatedTarget = event.relatedTarget
  if (relatedTarget instanceof Node && event.currentTarget instanceof Node && event.currentTarget.contains(relatedTarget)) {
    return
  }

  dropzoneDragDepth.value = Math.max(0, dropzoneDragDepth.value - 1)
  if (dropzoneDragDepth.value === 0) {
    dropzone.value = false
  }
}

const resetDropzone = () => {
  dropzone.value = false
  dropzoneDragDepth.value = 0
}

onMounted(() => {
  window.addEventListener('dragend', resetDropzone)
})

onBeforeUnmount(() => {
  window.removeEventListener('dragend', resetDropzone)
})

const catchDrop = (e: DragEvent) => {
  resetDropzone()
  if (!isElectron.value || props.items_type !== 'media' || !mediaType.value || !props.mediaTypeId) return

  const paths = collectDroppedPaths(e)
  if (!paths.length) return

  startDroppedMediaAdding({
    paths,
    mediaTypeId: props.mediaTypeId,
    mediaTypes: appStore.mediaTypes,
    tasksStore: tasksStore as Parameters<typeof startDroppedMediaAdding>[0]['tasksStore'],
    eventBus,
  })
}

defineEmits<{
  addMedia: []
  playVideo: [payload: unknown]
}>()
</script>

<style lang="scss">
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