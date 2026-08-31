<template>
  <v-container
    ref="container"
    class="items-layout-container"
  >

    <div
      ref="controlDeckSentinel"
      class="items-control-deck-sentinel"
      aria-hidden="true"
    />
    <div
      id="items-control-deck"
      class="items-control-deck items-control-deck--browser"
      :class="controlDeckClass"
    >
      <div class="items-control-deck__surface items-control-deck__surface--card">
        <div
          class="items-page-header items-control-deck__header items-page-header--deck d-flex align-center justify-space-between flex-nowrap ga-2"
        >
          <button
            type="button"
            class="items-control-deck__sticky-pin"
            :class="{'items-control-deck__sticky-pin--active': stickyControlDeck}"
            :aria-pressed="stickyControlDeck ? 'true' : 'false'"
            :aria-label="stickyControlDeck
              ? t('settings_labels.appearance.sticky_control_deck_unpin')
              : t('settings_labels.appearance.sticky_control_deck_pin')"
            v-tooltip:top="stickyControlDeck
              ? t('settings_labels.appearance.sticky_control_deck_unpin')
              : t('settings_labels.appearance.sticky_control_deck_pin')"
            @click="toggleStickyControlDeck"
          >
            <span class="items-control-deck__sticky-pin-glyph" aria-hidden="true">
              <v-icon size="16" icon="mdi-pin"/>
            </span>
          </button>

          <div class="items-page-header__title min-width-0">
            <div class="items-page-header__heading min-width-0">
              <v-icon class="items-page-header__icon" start>mdi-{{ ITEMS.icon }}</v-icon>
              <span class="items-page-header__name text-truncate">{{ pageTitle }}</span>
            </div>
            <div
              v-if="!loader.is_busy && (total > 0 || filesize_all)"
              class="items-page-header__badges"
            >
              <span
                v-if="total > 0"
                class="items-page-header__meta"
              >
                <template v-if="total != totalInDb">{{ total }} of {{ totalInDb }}</template>
                <template v-else>{{ total }}</template>
              </span>
              <span
                v-if="filesize_all"
                class="items-page-header__meta"
              >
                {{ filesize_all }}
              </span>
            </div>
          </div>

          <div class="d-flex align-center flex-nowrap ga-2 items-control-deck__controls">
            <ToolbarSort
              deck
              :class="smAndDown
                ? 'items-control-deck__sort-icon'
                : 'items-control-deck__field items-control-deck__sort'"
            />

            <ToolbarGroupBy
              compact
              :class="isGroupByOff || smAndDown
                ? 'items-control-deck__group-by-icon'
                : 'items-control-deck__field items-control-deck__group-by'"
            />

            <v-btn
              @click="toggleCustomization"
              v-tooltip:top="t('appbar.buttons.customize_appearance')"
              color="primary"
              :variant="toolbarStore.appearance.show ? 'flat' : 'tonal'"
              size="small"
              icon
            >
              <v-icon size="18">mdi-eye-settings-outline</v-icon>
            </v-btn>

            <v-btn
              @click="toggleFiltersPanel"
              v-tooltip:top="t('appbar.buttons.filter')"
              color="primary"
              :variant="filtersPanelOpen ? 'flat' : 'tonal'"
              size="small"
              icon
            >
              <v-badge
                v-if="activeFiltersCount > 0"
                :content="activeFiltersCount"
                color="secondary"
                floating
              >
                <v-icon size="18">mdi-filter-outline</v-icon>
              </v-badge>
              <v-icon v-else size="18">mdi-filter-outline</v-icon>
            </v-btn>
          </div>
        </div>

        <v-expand-transition>
          <div
            v-if="toolbarStore.appearance.show"
            id="items-control-deck-appearance"
            class="items-control-deck__appearance items-control-deck__section"
          >
            <div class="items-control-deck__appearance-close">
              <v-btn
                @click="toggleCustomization"
                size="x-small"
                icon
                variant="text"
                color="primary"
                :aria-label="t('common.close')"
              >
                <v-icon size="16">mdi-close</v-icon>
              </v-btn>
            </div>
            <ToolbarAppearance embedded/>
          </div>
        </v-expand-transition>

        <div
          id="items-filters-top-host"
          class="items-filters-top-host items-control-deck__filters-host"
        ></div>
      </div>
    </div>

    <div
      v-if="items_type === 'tag' && settingsStore.showAlphabetFilter == '1'"
      class="items-alphabet"
    >
      <button
        v-for="letter in alphabetLetters"
        :key="letter"
        type="button"
        class="items-alphabet__btn"
        :class="{
          'items-alphabet__btn--active': letterFilter === letter,
        }"
        @click="toggleLetterFilter(letter)"
      >
        {{ letter }}
      </button>
    </div>

    <div
      v-if="showColorFilterBar"
      class="items-color-filter"
    >
      <button
        type="button"
        class="items-color-filter__swatch items-color-filter__swatch--none"
        :class="{'items-color-filter__swatch--active': colorFilter === TAG_COLOR_FILTER_NONE}"
        :aria-pressed="colorFilter === TAG_COLOR_FILTER_NONE ? 'true' : 'false'"
        :aria-label="t('items.color_filter_none')"
        v-tooltip:top="t('items.color_filter_none')"
        @click="toggleColorFilter(TAG_COLOR_FILTER_NONE)"
      />
      <button
        v-for="color in categoryTagColors"
        :key="color"
        type="button"
        class="items-color-filter__swatch"
        :class="{'items-color-filter__swatch--active': colorFilter === color}"
        :style="{backgroundColor: color}"
        :aria-pressed="colorFilter === color ? 'true' : 'false'"
        :aria-label="color"
        v-tooltip:top="color"
        @click="toggleColorFilter(color)"
      />
    </div>

    <SavedFilters v-if="pageInitialized && settingsStore.showSavedFilters == '1'"/>

    <!-- Filters: top panel in the control deck -->
    <Filters v-if="pageInitialized" :isReady="isFiltersReady"/>

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
      v-if="pageInitialized && ITEMS.itemsOnPage.length && (isMasonryGrid || isSquaresGrid)"
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
      :square-items="isSquaresGrid"
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
      :list-grid="isListGrid"
      :chips-grid="isChipsGrid"
      :image-aspect-ratio="virtualCardAspectRatio"
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
            v-memo="[i.id, i.name, i.bookmark, i.time, i.views, i.viewedAt, i.favorite, i.rating, i.thumb, i.tags, i.values, ITEMS.size, ITEMS.view, listItemType, itemsRenderKey, ITEMS.thumbRefreshKeys[i.id]]"
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
          v-memo="[i.id, i.name, i.bookmark, i.time, i.views, i.viewedAt, i.favorite, i.rating, i.thumb, i.tags, i.values, ITEMS.size, ITEMS.view, listItemType, itemsRenderKey, ITEMS.thumbRefreshKeys[i.id]]"
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
      v-if="pageInitialized && ITEMS.itemsOnPage.length && infiniteScrollReachedEnd && mainScrollOverflowing"
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
      <div class="text-h6 mb-1">{{ t('empty_states.no_items_title') }}</div>
      <div class="text-medium-emphasis">
        {{ items_type === 'media'
          ? t('empty_states.no_items_media_hint')
          : t('empty_states.no_items_tags_hint') }}
      </div>
      <div class="text-caption text-medium-emphasis mt-2">
        {{ t('empty_states.search_hint') }}
      </div>
      <div class="mt-4 d-flex justify-center flex-wrap ga-2">
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
        <template v-if="items_type === 'media'">
          <v-btn
            color="primary"
            variant="tonal"
            rounded="xl"
            size="large"
            @click="openPrepareLibrary"
          >
            <v-icon start>mdi-auto-fix</v-icon>
            {{ t('empty_states.prepare_library') }}
          </v-btn>
          <v-btn
            color="primary"
            variant="tonal"
            rounded="xl"
            size="large"
            @click="openEmptySearch"
          >
            <v-icon start>mdi-magnify</v-icon>
            {{ t('empty_states.search') }}
          </v-btn>
          <v-btn
            color="primary"
            variant="text"
            rounded="xl"
            size="large"
            @click="browseByMediaCreated"
          >
            <v-icon start>mdi-calendar-plus</v-icon>
            {{ t('empty_states.browse_media_created') }}
          </v-btn>
        </template>
      </div>
    </div>

    <div v-if="pageInitialized && 0 == total && total !== totalInDb"
      class="layout-img">
      <v-img :src="image_filters_no_results"
        max-height="40vh"
        class="my-4"
        contain></v-img>
      <div class="text-medium-emphasis mb-4">{{ t('empty_states.no_filter_results') }}</div>
      <div class="d-flex justify-center flex-wrap ga-2">
        <v-btn
          color="primary"
          variant="flat"
          rounded="xl"
          @click="clearAllFilters"
        >
          <v-icon start>mdi-filter-off</v-icon>
          {{ t('empty_states.clear_filters') }}
        </v-btn>
        <v-btn
          color="primary"
          variant="tonal"
          rounded="xl"
          @click="openFilters"
        >
          <v-icon start>mdi-filter</v-icon>
          {{ t('empty_states.edit_filters') }}
        </v-btn>
      </div>
    </div>

    <div
      v-if="pageInitialized && ITEMS.itemsOnPage.length && infiniteScrollHasMore"
      class="infinite-loader-full-height"
      :aria-busy="isLoadingMore"
    >
      <!-- Fixed-height slot: the big logo Loading was the main CLS source on append. -->
      <div
        class="infinite-loader-slot"
        :class="{ 'infinite-loader-slot--active': isLoadingMore }"
      >
        <v-progress-circular
          indeterminate
          size="28"
          width="3"
          color="primary"
          :class="{ 'infinite-loader-spinner--hidden': !isLoadingMore }"
        />
      </div>

      <div
        v-intersect="infiniteIntersectOptions"
        class="infinite-scroll-sentinel"
        aria-hidden="true"
      />
    </div>

    <QuickActionButton v-if="SETTINGS.show_quick_action_button == '1'"/>

    <v-dialog
      v-model="dialogEditingPinnedMeta"
      @update:model-value="updatePinnedMeta"
      max-width="860"
      width="95vw"
      scrollable
    >
      <v-card>
        <DialogHeader
          @close="closePinnedMetaDialog"
          :header="t('meta.settings.editing_pinned_meta')"
          closable
        />

        <v-card-text class="py-4 px-2 px-sm-4">
          <SettingsMediaTypeAddedMeta
            v-if="itemsStore.type === 'media' && mediaType"
            :media-type="mediaType"
          />
          <MetaSettingsPinned
            v-if="itemsStore.type === 'tag' && meta"
            :meta="meta"
          />
        </v-card-text>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import {ref, computed, watch, onMounted, onBeforeUnmount, nextTick} from 'vue'
import {useRouter} from 'vue-router'
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
import {useAppShell} from '@/composable/appShell'
import {openLibrarySetupWizardQuery} from '@/composable/useLibrarySetupWizard'
import {useOpenMediaList} from '@/utils/openMediaList'
import type {ItemsPageProps, ItemsPageType} from '@/types/itemsPage'
import type {MediaType} from '@/types/media'
import type {Meta} from '@/types/stores'

// Компоненты
import Item from '@/components/items/Item.vue'
import ItemsVirtualGrid from '@/components/items/ItemsVirtualGrid.vue'
import ItemsMasonryGrid from '@/components/items/ItemsMasonryGrid.vue'
import Filters from '@/components/app/Filters.vue'
import SavedFilters from '@/components/elements/FiltersSaved.vue'
import Loading from '@/components/elements/Loading.vue'
import ItemsPaginationBar from '@/components/elements/ItemsPaginationBar.vue'
import QuickActionButton from '@/components/app/QuickActionButton.vue'
import ToolbarSort from '@/components/app/toolbar/ToolbarSort.vue'
import ToolbarGroupBy from '@/components/app/toolbar/ToolbarGroupBy.vue'
import ToolbarAppearance from "@/components/app/toolbar/ToolbarAppearance.vue";
import DialogMediaAdding from '@/components/dialogs/DialogMediaAdding.vue'
import TagsAdd from '@/components/app/appbar/elements/TagsAdd.vue'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import SettingsMediaTypeAddedMeta from '@/components/settings/SettingsMediaTypeAddedMeta.vue'
import MetaSettingsPinned from '@/components/dialogs/meta/MetaSettingsPinned.vue'
import {getMediaTypeName} from '@/utils/mediaTypeI18n'
import {isVideoMediaType, isImageMediaType} from '@/utils/mediaType'
import {getReadableFileSize} from '@/services/formatUtils'
import {useItemsThumbPrefetch} from '@/composable/useItemsThumbPrefetch'
import {useResponsiveGridLayout} from '@/composable/useResponsiveGridLayout'
import {useItemsFiltersController} from '@/composable/itemsFiltersController'
import {useItemsPageCommands} from '@/composable/itemsPageCommands'
import {useStickyControlDeck} from '@/composable/useStickyControlDeck'
import {useMainScrollOverflow} from '@/composable/useMainScrollOverflow'
import {remountPageTagLayoutItems} from '@/composable/pageTagLayoutRemount'
import {reloadMetaCatalog} from '@/composable/metaCatalog'
import {shouldUseVirtualGrid, shouldUseVirtualMasonry} from '@/utils/gridLayout'
import {clearVisibleItemIds} from '@/utils/visibleItemsWindow'
import {resetVisibilityObserver} from '@/utils/sharedVisibilityObserver'
import {
  buildItemGroups,
  getGroupKeyAndLabel,
  normalizeItemsGroupBy,
  resolveActiveItemsGroupBy,
  type ItemsGroupSection,
} from '@/utils/itemsGroupBy'
import {getFilterObject} from '@/services/formatUtils'
import {getTagFirstLetter} from '@shared/transliterate'
import {
  approximateTagColor,
  compareTagColorSwatches,
  TAG_COLOR_FILTER_NONE,
} from '@shared/tagColorFilter'
import type { MediaItem } from '@/types/stores'

// Пропсы
const props = defineProps<ItemsPageProps>()

// Сторы Pinia
const itemsStore = useItemsStore()
const settingsStore = useSettingsStore()
const toolbarStore = useToolbarStore()
const registrationStore = useRegistrationStore()
const appStore = useAppStore()
const filtersController = useItemsFiltersController()
const pageCommands = useItemsPageCommands()
const {t, locale} = useI18n()
const router = useRouter()
const appShell = useAppShell()
const {openMediaList} = useOpenMediaList()

function openPrepareLibrary() {
  void router.push({path: '/settings', query: openLibrarySetupWizardQuery()})
}

function openEmptySearch() {
  appShell.showGlobalSearch()
}

function browseByMediaCreated() {
  void openMediaList({
    sortBy: 'createdAt',
    sortDir: 'desc',
    groupBy: 'dateDay',
  })
}

// Константы из Vuetify
const {xs, smAndDown} = useDisplay()

// Запускает watcher генерации превью в composable
useVideoImageGenerator()

// Реактивные переменные
const mediaType = ref<MediaType | null>(null)
const meta = ref<Meta | null>(null)
const container = ref<HTMLElement | null>(null)
const itemsGridRef = ref<HTMLElement | null>(null)
const dialogEditingPinnedMeta = ref(false)
const letterFilter = ref<string | null>(
  settingsStore.showAlphabetFilter === '1' ? itemsStore.namePrefix : null,
)
if (settingsStore.showAlphabetFilter !== '1' && itemsStore.namePrefix) {
  itemsStore.namePrefix = null
}
const colorFilter = ref<string | null>(
  settingsStore.showColorFilter === '1' ? itemsStore.colorFilter : null,
)
if (settingsStore.showColorFilter !== '1' && itemsStore.colorFilter) {
  itemsStore.colorFilter = null
}
const {
  controlDeckSentinel,
  controlDeckClass,
  stickyControlDeck,
  toggleStickyControlDeck,
} = useStickyControlDeck()

const {
  isFiltersReady,
  updatePageSetting,
  flushPageSettings,
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

const {mainScrollOverflowing} = useMainScrollOverflow({
  watchSources: [
    () => itemsStore.itemsOnPage.length,
    () => pageInitialized.value,
    () => infiniteScrollReachedEnd.value,
  ],
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

const filtersPanelOpen = computed(() => Boolean(appStore.filters.visible))
const activeFiltersCount = computed(() => activeFilters.value.length)
const isGroupByOff = computed(() =>
  normalizeItemsGroupBy(ITEMS.value.groupBy) === 'none',
)
const isImageGrid = computed(() =>
  props.items_type === 'media' && mediaType.value?.type === 'image' && ITEMS.value.view == 1
)
const isMasonryGrid = computed(() =>
  props.items_type === 'media' && mediaType.value?.type === 'image' && ITEMS.value.view == 3
)
const isSquaresGrid = computed(() =>
  props.items_type === 'media' && mediaType.value?.type === 'image' && ITEMS.value.view == 6
)
const isWideImage = computed(() =>
  props.items_type === 'media' && isVideoMediaType(mediaType.value) && ITEMS.value.view == 2
)
const isLineGrid = computed(() => isWideImage.value)
const isListGrid = computed(() =>
  (props.items_type === 'media' || props.items_type === 'tag') && ITEMS.value.view == 5
)
const isChipsGrid = computed(() =>
  props.items_type === 'tag' && ITEMS.value.view == 2
)
const tagImageAspectRatio = computed(() => {
  const ratio = Number(meta.value?.imageAspectRatio)
  return Number.isFinite(ratio) && ratio > 0 ? ratio : undefined
})
/** Stable card estimate for virtual image grids (16:9) when meta has no ratio. */
const virtualCardAspectRatio = computed(() => {
  if (tagImageAspectRatio.value) return tagImageAspectRatio.value
  if (isImageGrid.value) return 16 / 9
  return undefined
})
const listItemType = computed((): ItemsPageType =>
  props.items_type === 'tag' ? 'tag' : 'media',
)
const useVirtualGrid = computed(() =>
  isGroupByOff.value
  && !isMasonryGrid.value
  && !isSquaresGrid.value
  && !isChipsGrid.value
  && shouldUseVirtualGrid(
    ITEMS.value.itemsOnPage.length,
    is_infinite_scroll.value,
    listItemType.value,
    {enabled: SETTINGS.value.virtualImageGrid !== '0'},
  ),
)
const useVirtualMasonry = computed(() =>
  (isMasonryGrid.value || isSquaresGrid.value)
  && shouldUseVirtualMasonry(
    ITEMS.value.itemsOnPage.length,
    is_infinite_scroll.value,
    listItemType.value,
    {
      enabled: SETTINGS.value.virtualImageGrid !== '0',
      items: ITEMS.value.itemsOnPage,
    },
  ),
)

const groupedSections = computed(() => {
  if (isMasonryGrid.value || isSquaresGrid.value) return null
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
    t: (key: string, params?: Record<string, string | number>) =>
      params ? t(key, params) : t(key),
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
  pageCommands.setGroupBy('none')
  // Let Filters.vue sync store → local filters before apply (same pattern as ItemPinnedMeta).
  setTimeout(() => {
    void filtersController.apply()
  }, 0)
}

onBeforeUnmount(() => {
  clearVisibleItemIds()
  resetVisibilityObserver()
  void flushPageSettings()
})
const itemsGridClasses = computed(() => [
  `item__size-${ITEMS.value.size}`,
  `gap-size-${SETTINGS.value.gapSize}`,
  {'card-grid': ITEMS.value.view == 1 || ITEMS.value.view == 4},
  {'chips-grid': isChipsGrid.value},
  {'line-grid': isLineGrid.value},
  {'wide-image': isWideImage.value},
  {'image-grid': isImageGrid.value},
  {'masonry-grid': isMasonryGrid.value},
  {'list-grid': isListGrid.value},
])
const itemsGridLayoutOptions = computed(() => ({
  size: ITEMS.value.size,
  gapSize: SETTINGS.value.gapSize,
  imageGrid: isImageGrid.value || isMasonryGrid.value || isSquaresGrid.value,
  wideImage: isWideImage.value,
  lineGrid: isLineGrid.value,
  listGrid: isListGrid.value,
  chipsGrid: isChipsGrid.value,
  imageAspectRatio: virtualCardAspectRatio.value,
}))
const { gridStyle: itemsGridStyle } = useResponsiveGridLayout(itemsGridRef, itemsGridLayoutOptions)
const reg = computed(() => registrationStore.reg)
const ENV = computed(() => ITEMS.value.environment)

const alphabetLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

function toggleLetterFilter(letter: string): void {
  if (letterFilter.value === letter) {
    letterFilter.value = null
  } else {
    letterFilter.value = letter
  }
}

watch(letterFilter, (val) => {
  if (itemsStore.type !== 'tag') return
  itemsStore.updateState({key: 'page', value: 1})
  itemsStore.namePrefix = val
  void getItemsFromDb()
})

watch(() => settingsStore.showAlphabetFilter, (val) => {
  if (val === '1') return
  if (letterFilter.value) {
    letterFilter.value = null
    return
  }
  if (!itemsStore.namePrefix) return
  itemsStore.namePrefix = null
  if (itemsStore.type === 'tag') {
    itemsStore.updateState({key: 'page', value: 1})
    void getItemsFromDb()
  }
})

const categoryTagColors = computed(() => {
  const metaId = Number(props.metaId)
  if (!Number.isFinite(metaId) || metaId <= 0) return [] as string[]
  const unique = new Set<string>()
  for (const tag of appStore.tags) {
    if (Number(tag.metaId) !== metaId) continue
    const bucket = approximateTagColor(tag.color)
    if (!bucket) continue
    unique.add(bucket)
  }
  return [...unique].sort(compareTagColorSwatches)
})

const showColorFilterBar = computed(() => (
  props.items_type === 'tag'
  && settingsStore.showColorFilter === '1'
  && !!meta.value?.color
))

function toggleColorFilter(value: string): void {
  if (colorFilter.value === value) {
    colorFilter.value = null
  } else {
    colorFilter.value = value
  }
}

function clearColorFilter(): void {
  if (colorFilter.value) {
    colorFilter.value = null
    return
  }
  if (!itemsStore.colorFilter) return
  itemsStore.colorFilter = null
  if (itemsStore.type === 'tag') {
    itemsStore.updateState({key: 'page', value: 1})
    void getItemsFromDb()
  }
}

watch(colorFilter, (val) => {
  if (itemsStore.type !== 'tag') return
  itemsStore.updateState({key: 'page', value: 1})
  itemsStore.colorFilter = val
  void getItemsFromDb()
})

watch(() => settingsStore.showColorFilter, (val) => {
  if (val === '1') return
  clearColorFilter()
})

watch(() => meta.value?.color, (enabled) => {
  if (meta.value == null) return
  if (enabled) return
  clearColorFilter()
})

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

function openFilters() {
  appStore.filters.visible = true
}

function clearAllFilters() {
  filtersController.deactivateAll()
}

// Методы
const toggleCustomization = () => {
  const toolbarStore = useToolbarStore()
  toolbarStore.appearance.show = !toolbarStore.appearance.show
}

const toggleFiltersPanel = () => {
  appStore.filters.visible = !appStore.filters.visible
}

const updatePinnedMeta = () => {
  if (itemsStore.type === 'tag') {
    void reloadMetaCatalog()
  }
  void pageCommands.refreshAssignedMeta()
  remountPageTagLayoutItems()
}

const closePinnedMetaDialog = () => {
  dialogEditingPinnedMeta.value = false
  updatePinnedMeta()
}

defineEmits<{
  addMedia: []
  playVideo: [payload: unknown]
}>()
</script>

<style lang="scss">
.items-page-grid:not(.items-virtual-grid) :deep(.item) {
  content-visibility: auto;
  /* Prefer a tall estimate: undersized intrinsic size makes cards jump when painted. */
  contain-intrinsic-size: auto 360px;
}

.items-page-grid:not(.items-virtual-grid) :deep(.item-view-5) {
  /* List rows are much shorter than cards — match their real height. */
  contain-intrinsic-size: auto 90px;
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
  padding: 12px 0 24px;
  /* Loader must not steal scroll anchoring from the card grid above. */
  overflow-anchor: none;
  contain: layout style;
}

.infinite-loader-slot {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 40px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
}

.infinite-loader-slot--active {
  opacity: 1;
}

.infinite-loader-spinner--hidden {
  visibility: hidden;
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
  overflow-anchor: none;
}

.items-alphabet {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  margin-bottom: 12px;
}

.items-alphabet__btn {
  min-width: 28px;
  height: 28px;
  padding: 0 4px;
  border: none;
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.04);
  color: rgba(var(--v-theme-on-surface), 0.7);
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 28px;
  text-align: center;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;

  &:hover {
    background: rgba(var(--v-theme-on-surface), 0.1);
    color: rgba(var(--v-theme-on-surface), 0.9);
  }

  &--active {
    background: rgb(var(--v-theme-primary));
    color: rgb(var(--v-theme-on-primary));
  }
}

.items-color-filter {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
}

.items-color-filter__swatch {
  width: 22px;
  height: 22px;
  padding: 0;
  border-radius: 50%;
  border: 2px solid rgba(var(--v-theme-on-surface), 0.18);
  background: transparent;
  cursor: pointer;
  flex-shrink: 0;
  transition: box-shadow 0.15s ease, border-color 0.15s ease, transform 0.15s ease;

  &:hover {
    transform: scale(1.08);
  }

  &--none {
    position: relative;
    background: rgba(var(--v-theme-on-surface), 0.04);

    &::after {
      content: '';
      position: absolute;
      left: 18%;
      right: 18%;
      top: 50%;
      height: 2px;
      background: rgba(var(--v-theme-on-surface), 0.5);
      transform: rotate(-45deg);
    }
  }

  &--active {
    border-color: rgb(var(--v-theme-primary));
    box-shadow: 0 0 0 2px rgb(var(--v-theme-primary));
  }
}
</style>