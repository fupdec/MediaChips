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

    <!-- Quick filters are hidden by default: only active ones are shown here as
         removable chips. The full set lives inside the filters panel. -->
    <div
      v-if="!filtersPanelOpen && (letterFilter || colorFilter)"
      class="items-quick-active"
    >
      <button
        v-if="letterFilter"
        type="button"
        class="items-quick-active__chip"
        :aria-label="`${t('common.reset')}: ${letterFilter}`"
        v-tooltip:top="t('common.reset')"
        @click="letterFilter = null"
      >
        <span class="items-quick-active__letter">{{ letterFilter }}</span>
        <v-icon size="14">mdi-close</v-icon>
      </button>
      <button
        v-if="colorFilter"
        type="button"
        class="items-quick-active__chip"
        :aria-label="`${t('common.reset')}: ${colorFilter === TAG_COLOR_FILTER_NONE ? t('items.color_filter_none') : colorFilter}`"
        v-tooltip:top="t('common.reset')"
        @click="colorFilter = null"
      >
        <span
          class="items-color-filter__swatch items-quick-active__swatch"
          :class="{'items-color-filter__swatch--none': colorFilter === TAG_COLOR_FILTER_NONE}"
          :style="colorFilter === TAG_COLOR_FILTER_NONE ? undefined : {backgroundColor: colorFilter}"
        />
        <v-icon size="14">mdi-close</v-icon>
      </button>
    </div>

    <!-- Filters: top panel in the control deck; quick filters render inside it -->
    <Filters v-if="pageInitialized" :isReady="isFiltersReady">
      <template #quick-settings>
        <v-menu
          location="bottom end"
          :close-on-content-click="false"
        >
          <template #activator="{props: menuProps}">
            <v-btn
              v-bind="menuProps"
              icon
              size="x-small"
              variant="text"
              color="primary"
              :aria-label="t('filters.quick_settings')"
              v-tooltip:top="t('filters.quick_settings')"
            >
              <v-icon size="16">mdi-tune-variant</v-icon>
            </v-btn>
          </template>
          <v-card
            rounded="xl"
            class="items-quick-menu"
          >
            <div class="items-quick-menu-title">{{ t('filters.quick_settings') }}</div>
            <SettingsSwitch
              v-if="items_type === 'tag'"
              option="showAlphabetFilter"
              :title="t('settings_labels.appearance.alphabet_filter')"
              density="compact"
            />
            <SettingsSwitch
              v-if="items_type === 'tag' && meta?.color"
              option="showColorFilter"
              :title="t('settings_labels.appearance.color_filter')"
              density="compact"
            />
            <SettingsSwitch
              option="showSavedFilters"
              :title="t('settings_labels.appearance.saved_filters')"
              density="compact"
            />
          </v-card>
        </v-menu>
      </template>

      <template
        v-if="!quickAllHidden"
        #quick
      >
        <EditingSectionHeader
          icon="mdi-lightning-bolt-outline"
          :title="t('filters.quick_presets')"
        />
        <div
          v-if="showAlphabetBar || showColorFilterBar"
          class="items-quick-row"
        >
          <div
            v-if="showAlphabetBar"
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
        </div>
        <SavedFilters v-if="showSavedChips"/>
      </template>
    </Filters>

    <ItemsBrowseSkeleton
      v-if="loader.is_busy && !ITEMS.itemsOnPage.length"
      class="items-page-grid"
      :size="ITEMS.size"
      :gap-size="SETTINGS.gapSize"
      :view="ITEMS.view"
      :items-type="listItemType"
      :media-type="mediaType"
      :image-aspect-ratio="virtualCardAspectRatio"
    />

    <ItemsPaginationBar
      class="items-pagination--top"
      v-if="showPagination && !loader.is_busy"
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
      :window-start="infiniteWindowStart"
      :total-count="virtualTotalCount"
      class="items-page-grid"
    >
      <template #after-data>
        <div
          v-if="infiniteScrollHasMore"
          class="infinite-loader-full-height"
          :aria-busy="showInfiniteLoader"
        >
          <div
            class="infinite-loader-slot"
            :class="{ 'infinite-loader-slot--active': showInfiniteLoader }"
          >
            <v-progress-circular
              indeterminate
              size="28"
              width="3"
              color="primary"
            />
          </div>
          <div
            v-intersect="infiniteIntersectOptions"
            class="infinite-scroll-sentinel"
            aria-hidden="true"
          />
        </div>
        <div
          v-else-if="infiniteScrollReachedEnd"
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
      </template>
    </ItemsVirtualGrid>

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
      v-if="!loader.is_busy && pageInitialized && ITEMS.itemsOnPage.length && infiniteScrollReachedEnd && !useVirtualGrid && mainScrollOverflowing"
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
      class="items-pagination--bottom"
      v-if="showPagination && !loader.is_busy"
      v-model:page="paginationPage"
      v-model:jump-page="jumpPageForPagination"
      :pages="pages"
      :total-visible="paginationTotalVisible"
      @change="changePage"
      @jump="jumpToPage"
    />

    <div v-if="!loader.is_busy && pageInitialized && 0 == total && total == totalInDb"
      class="layout-img">
      <v-img src="/images/no-data.svg"
        max-height="40vh"
        class="my-4"
        contain></v-img>
      <div class="text-h6 mb-1">{{ t('empty_states.no_items_title') }}</div>
      <div class="text-medium-emphasis">
        {{ items_type === 'media'
          ? t('empty_states.choose_library_folder_hint')
          : t('empty_states.no_items_tags_hint') }}
      </div>
      <div
        v-if="items_type === 'media'"
        class="text-caption text-medium-emphasis mt-2"
      >
        {{ t('empty_states.choose_library_folder_privacy') }}
      </div>
      <div class="mt-4 d-flex justify-center flex-wrap ga-2">
        <v-btn
          v-if="items_type === 'media'"
          color="success"
          variant="flat"
          rounded="xl"
          size="large"
          :loading="choosingLibraryFolder"
          :disabled="choosingLibraryFolder"
          @click="onChooseLibraryFolder"
        >
          <v-icon start>mdi-folder-plus-outline</v-icon>
          {{ t('empty_states.choose_library_folder') }}
        </v-btn>
        <DialogMediaAdding
          v-if="items_type === 'media'"
          button-color="primary"
          button-size="large"
          button-variant="tonal"
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

    <div v-if="!loader.is_busy && pageInitialized && 0 == total && total !== totalInDb"
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

    <!-- Plain grid only — virtual grid hosts the sentinel at the data-window end. -->
    <div
      v-if="pageInitialized && ITEMS.itemsOnPage.length && infiniteScrollHasMore && !useVirtualGrid"
      class="infinite-loader-full-height"
      :aria-busy="showInfiniteLoader"
    >
      <!-- Fixed-height slot: keep height stable; show spinner while loading or queued. -->
      <div
        class="infinite-loader-slot"
        :class="{ 'infinite-loader-slot--active': showInfiniteLoader }"
      >
        <v-progress-circular
          indeterminate
          size="28"
          width="3"
          color="primary"
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
          icon="pin-outline"
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
import ItemsBrowseSkeleton from '@/components/items/ItemsBrowseSkeleton.vue'
import ItemsVirtualGrid from '@/components/items/ItemsVirtualGrid.vue'
import ItemsMasonryGrid from '@/components/items/ItemsMasonryGrid.vue'
import Filters from '@/components/app/Filters.vue'
import SavedFilters from '@/components/elements/FiltersSaved.vue'
import SettingsSwitch from '@/components/ui/SettingsSwitch.vue'
import EditingSectionHeader from '@/components/items/EditingSectionHeader.vue'
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
import {chooseLibraryFolderAndImport} from '@/composable/useChooseLibraryFolder'
import {ensureSilentStarterMetaForEmptyLibrary} from '@/composable/useEmptyLibraryLanding'
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
import {isImageOnlyItemsView} from '@/utils/itemsView'
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
const choosingLibraryFolder = ref(false)

async function onChooseLibraryFolder() {
  if (choosingLibraryFolder.value) return
  choosingLibraryFolder.value = true
  try {
    await chooseLibraryFolderAndImport()
  } finally {
    choosingLibraryFolder.value = false
  }
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
  infiniteLoadPending,
  infiniteWindowStart,
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

const showInfiniteLoader = computed(() => isLoadingMore.value || infiniteLoadPending.value)
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

watch(
  () => pageInitialized.value && total.value === 0 && total.value === totalInDb.value,
  (isTrulyEmpty) => {
    if (isTrulyEmpty && props.items_type === 'media') {
      void ensureSilentStarterMetaForEmptyLibrary()
    }
  },
  {immediate: true},
)

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
const quickActiveCount = computed(() =>
  (letterFilter.value ? 1 : 0) + (colorFilter.value ? 1 : 0),
)
const activeFiltersCount = computed(() => activeFilters.value.length + quickActiveCount.value)
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
  if (props.items_type !== 'tag') return undefined
  const ratio = Number(meta.value?.imageAspectRatio)
  return Number.isFinite(ratio) && ratio > 0 ? ratio : undefined
})
/** Tag meta aspect only on tag pages; media cards always estimate as 16:9. */
const virtualCardAspectRatio = computed(() => {
  if (tagImageAspectRatio.value) return tagImageAspectRatio.value
  if (props.items_type === 'media') return 16 / 9
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

// Saved-filter chips used to reset the active filters on their own unmount.
// They now live inside the filters panel (mounted only while it is open and
// the chips are enabled), so the reset is tied to the page lifecycle instead.
watch(pageInitialized, (ready, wasReady) => {
  if (wasReady && !ready) itemsStore.clearSavedFilters()
})

onBeforeUnmount(() => {
  itemsStore.clearSavedFilters()
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
  imageOnly: isImageOnlyItemsView(ITEMS.value.view),
  imageAspectRatio: virtualCardAspectRatio.value,
}))
const { gridStyle: itemsGridStyle } = useResponsiveGridLayout(
  itemsGridRef,
  itemsGridLayoutOptions,
)

/** Scrollbar extent for the virtual grid.
 * - Paginated: this page only (never the whole library — that looked like a
 *   broken infinite list when limit was 50 and virtualization kicked in).
 * - Infinite: full filtered count so the thumb can seek across the library.
 */
const virtualTotalCount = computed(() => {
  const loaded = ITEMS.value.itemsOnPage.length
  const start = Math.max(0, infiniteWindowStart.value)
  if (!is_infinite_scroll.value) return loaded
  const filtered = Math.max(0, Number(ITEMS.value.totalFiltered) || 0)
  return Math.max(filtered, start + loaded, loaded)
})

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

const showAlphabetBar = computed(() => (
  props.items_type === 'tag' && settingsStore.showAlphabetFilter === '1'
))

const showSavedChips = computed(() => (
  settingsStore.showSavedFilters === '1' && (itemsStore.filters_saved?.length ?? 0) > 0
))

const quickAllHidden = computed(() => (
  !showAlphabetBar.value && !showColorFilterBar.value && !showSavedChips.value
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

/* ── Quick filters (inside the filters panel): shared "track" look ── */
.items-alphabet,
.items-color-filter {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  width: fit-content;
  max-width: 100%;
  padding: 4px;
  border-radius: 14px;
  background: rgba(var(--v-theme-on-surface), 0.04);
  box-shadow: inset 0 0 0 1px rgba(var(--v-theme-on-surface), 0.05);
}

.items-alphabet {
  gap: 2px;
}

.items-alphabet__btn {
  min-width: 30px;
  height: 30px;
  padding: 0 6px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 30px;
  text-align: center;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;

  &:hover {
    background: rgba(var(--v-theme-primary), 0.1);
    color: rgb(var(--v-theme-primary));
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(var(--v-theme-primary), 0.5);
  }

  &--active,
  &--active:hover {
    background: rgb(var(--v-theme-primary));
    color: rgb(var(--v-theme-on-primary));
    box-shadow: 0 2px 6px rgba(var(--v-theme-primary), 0.35);
  }
}

.items-color-filter {
  gap: 6px;
  padding: 8px 10px;
  border-radius: 999px;
}

.items-color-filter__swatch {
  position: relative;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  flex-shrink: 0;
  /* thin inner edge so light swatches don't melt into the track */
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.14);
  transition: box-shadow 0.15s ease, transform 0.15s ease;

  &:hover {
    transform: scale(1.12);
  }

  &:focus-visible {
    outline: none;
    box-shadow:
      inset 0 0 0 1px rgba(0, 0, 0, 0.14),
      0 0 0 2px rgb(var(--v-theme-surface)),
      0 0 0 4px rgba(var(--v-theme-primary), 0.5);
  }

  &--none {
    background: rgb(var(--v-theme-surface));
    box-shadow: inset 0 0 0 1.5px rgba(var(--v-theme-on-surface), 0.28);

    &::after {
      content: '';
      position: absolute;
      left: 22%;
      right: 22%;
      top: calc(50% - 0.75px);
      height: 1.5px;
      border-radius: 1px;
      background: rgba(var(--v-theme-on-surface), 0.5);
      transform: rotate(-45deg);
    }
  }

  &--active,
  &--active:hover {
    transform: scale(1.12);
    box-shadow:
      inset 0 0 0 1px rgba(0, 0, 0, 0.14),
      0 0 0 2px rgb(var(--v-theme-surface)),
      0 0 0 4px rgb(var(--v-theme-primary));
  }
}

/* ── Quick filters inside the filters panel, grouped by type ── */
.filters-top__quick .editing-group-header {
  padding: 8px 4px 6px;
}

.filters-top__quick .items-quick-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}

.filters-top__quick .sf-chips.d-flex {
  margin: 2px -4px -4px;
}

.items-quick-menu {
  min-width: 280px;
  padding: 8px 16px 12px;
}

.items-quick-menu-title {
  padding: 4px 0 4px;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

/* Active quick filters shown under the deck while the panel is closed */
.items-quick-active {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;
}

.items-quick-active__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 8px 0 12px;
  border: none;
  border-radius: 999px;
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s ease;

  &:hover {
    background: rgba(var(--v-theme-primary), 0.2);
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(var(--v-theme-primary), 0.5);
  }
}

.items-quick-active__swatch {
  width: 16px;
  height: 16px;
  pointer-events: none;

  &:hover {
    transform: none;
  }
}

.items-layout-container .items-pagination--top {
  margin: 16px 0 32px;
}

.items-layout-container .items-pagination--bottom {
  margin: 40px 0 calc(32px + var(--floating-bottom-dock-reserve, 0px));
}
</style>