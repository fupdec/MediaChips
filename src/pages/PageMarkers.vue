<template>
  <v-container
    class="markers-layout-container"
    :class="{
      'markers-page--has-selection': clipStudioMode && selectedOrder.length > 0,
      'markers-page--clip-studio': clipStudioMode,
    }"
  >
    <div
      ref="controlDeckSentinel"
      class="items-control-deck-sentinel"
      aria-hidden="true"
    />
    <div
      class="items-control-deck items-control-deck--browser markers-control-deck"
      :class="controlDeckClass"
    >
      <div class="items-control-deck__surface items-control-deck__surface--card">
        <div
          class="items-page-header items-control-deck__header items-page-header--deck d-flex align-center justify-space-between flex-nowrap ga-2"
        >
          <div class="d-flex align-center items-page-header__title min-width-0">
            <v-icon class="items-page-header__icon" start>mdi-tooltip-outline</v-icon>
            <span class="items-page-header__name text-truncate">{{ t('navigation.markers') }}</span>
            <span
              v-if="!marksStore.isLoading && marksStore.totalFiltered > 0"
              class="items-page-header__meta"
            >
              <template v-if="marksStore.totalFiltered !== marksStore.total">
                ({{ marksStore.totalFiltered }} of {{ marksStore.total }})
              </template>
              <template v-else>
                ({{ marksStore.totalFiltered }})
              </template>
            </span>
          </div>

          <div class="d-flex align-center flex-nowrap ga-2 items-control-deck__controls markers-control-deck__controls">
            <v-text-field
              v-model="searchInput"
              :placeholder="t('markers.search_placeholder')"
              :aria-label="t('markers.search_placeholder')"
              prepend-inner-icon="mdi-magnify"
              variant="outlined"
              density="compact"
              rounded="xl"
              clearable
              hide-details
              single-line
              class="items-control-deck__field markers-control-deck__field markers-control-deck__search"
              @click:clear="applySearch('')"
              @keydown.enter="applySearch(searchInput)"
              @blur="applySearch(searchInput)"
            />

            <v-autocomplete
              :model-value="marksStore.sortBy"
              @update:model-value="onSortChange"
              :items="MARK_SORT_PARAMS"
              item-value="param"
              rounded="xl"
              variant="outlined"
              density="compact"
              :placeholder="t('filters.sort_by')"
              :aria-label="t('filters.sort_by')"
              class="items-control-deck__field items-control-deck__sort markers-control-deck__field"
              hide-details
              single-line
              :disabled="marksStore.isLoading"
            >
              <template #prepend>
                <v-btn
                  v-tooltip:top="t('filters.change_direction')"
                  color="primary"
                  variant="tonal"
                  size="small"
                  icon
                  @click="toggleSortDir"
                >
                  <v-icon size="18">
                    {{ marksStore.sortDir === 'asc' ? 'mdi-sort-ascending' : 'mdi-sort-descending' }}
                  </v-icon>
                </v-btn>
              </template>
              <template #selection="{ item }">
                <v-icon :icon="`mdi-${item.raw.icon}`" size="small"/>
                <span class="pl-2">{{ t(item.raw.textKey) }}</span>
              </template>
              <template #item="{ item, props: menuProps }">
                <v-list-item v-bind="menuProps" density="compact">
                  <template #title>
                    <div class="text-body-2 py-1">
                      <v-icon :icon="`mdi-${item.raw.icon}`" size="small"/>
                      <span class="pl-4">{{ t(item.raw.textKey) }}</span>
                    </div>
                  </template>
                </v-list-item>
              </template>
            </v-autocomplete>

            <v-btn
              color="primary"
              :variant="clipStudioMode ? 'flat' : 'tonal'"
              size="small"
              rounded="xl"
              class="markers-control-deck__studio-toggle"
              v-tooltip:top="clipStudioMode ? t('markers.clip_studio_mode_on') : t('markers.clip_studio_mode')"
              @click="toggleClipStudioMode"
            >
              <v-icon size="18" :start="!smAndDown">mdi-movie-open-outline</v-icon>
              <span v-if="!smAndDown">{{ t('markers.clip_studio_mode') }}</span>
            </v-btn>

            <template v-if="clipStudioMode">
              <v-btn
                :variant="clipSort === 'selection' ? 'flat' : 'tonal'"
                color="primary"
                size="small"
                icon
                v-tooltip:top="t('tags.play_clips_in_order')"
                @click="setReelOrderMode"
              >
                <v-icon size="18">mdi-sort-clock-ascending-outline</v-icon>
              </v-btn>
              <v-btn
                :variant="clipSort === 'shuffle' ? 'flat' : 'tonal'"
                color="primary"
                size="small"
                icon
                v-tooltip:top="t('tags.play_clips_shuffle')"
                @click="shuffleReelOrder"
              >
                <v-icon size="18">mdi-shuffle-variant</v-icon>
              </v-btn>

              <v-btn
                color="secondary"
                variant="tonal"
                size="small"
                :icon="smAndDown"
                :rounded="smAndDown ? undefined : 'xl'"
                class="markers-control-deck__select-all"
                :disabled="!rangedIdsOnPage.length"
                v-tooltip:top="t('markers.select_all_clips', {count: rangedIdsOnPage.length})"
                @click="selectAllRangedOnPage"
              >
                <v-icon size="18" :start="!smAndDown">mdi-checkbox-multiple-marked-outline</v-icon>
                <span v-if="!smAndDown" class="markers-control-deck__select-all-label">
                  {{ t('markers.select_all_clips', {count: rangedIdsOnPage.length}) }}
                </span>
              </v-btn>
            </template>
          </div>
        </div>

        <div class="items-control-deck__section markers-control-deck__filters">
          <v-chip-group
            :model-value="marksStore.selectedTypes"
            @update:model-value="onTypesChange"
            color="primary"
            column
            multiple
          >
            <v-chip
              filter
              size="small"
              :color="marksStore.clipsOnly || clipStudioMode ? 'primary' : undefined"
              :variant="marksStore.clipsOnly || clipStudioMode ? 'flat' : 'tonal'"
              :prepend-icon="clipStudioMode ? 'mdi-lock' : 'mdi-movie-open-play-outline'"
              :class="{'markers-control-deck__clips-locked': clipStudioMode}"
              v-tooltip:top="clipStudioMode ? t('markers.clips_only_locked') : t('markers.clips_only')"
              @click.stop="toggleClipsOnly"
            >
              {{ t('markers.clips_only') }}
            </v-chip>
            <v-chip value="favorite" size="small">
              <v-icon icon="mdi-heart" size="small" start/>
              {{ t('meta.default_names.favorite') }}
            </v-chip>
            <v-chip value="bookmark" size="small">
              <v-icon icon="mdi-bookmark" size="small" start/>
              {{ t('meta.default_names.bookmark') }}
            </v-chip>
            <v-chip value="chapter" size="small">
              <v-icon icon="mdi-movie-open-outline" size="small" start/>
              {{ t('player.auto_chapters') }}
            </v-chip>
            <v-chip
              v-for="meta in marksStore.filterMetas"
              :key="meta.id"
              :value="String(meta.id)"
              size="small"
              :prepend-icon="`mdi-${String(meta.icon || 'tag')}`"
              :text="String(meta.name ?? '')"
            />
          </v-chip-group>
          <div class="markers-control-deck__hint text-caption text-medium-emphasis">
            <template v-if="clipStudioMode">
              {{ t('markers.clip_studio_subtitle') }}
              · {{ t('markers.select_ranged_hint') }}
              <span class="ml-1">{{ t('markers.select_range_hint') }}</span>
            </template>
            <template v-else>
              {{ t('markers.clip_studio_mode_hint') }}
            </template>
          </div>
        </div>
      </div>
    </div>

    <Loading v-if="marksStore.isLoading"/>

    <v-row v-else-if="marksStore.marksOnPage.length">
      <v-col
        v-for="mark in marksStore.marksOnPage"
        :key="mark.id"
        cols="12"
        sm="4"
        md="3"
        xl="2"
      >
        <ItemMarker
          :mark="mark"
          :selectable="itemsStore.isSelect || clipStudioMode"
          :require-range="!itemsStore.isSelect"
          :selected="isMarkSelected(Number(mark.id))"
          @update:selected="(selected, meta) => onMarkCardSelect(Number(mark.id), selected, meta)"
        />
      </v-col>
    </v-row>

    <div
      v-if="marksStore.isLoaded && marksStore.total === 0"
      class="layout-img"
    >
      <v-img
        src="/images/no-data.svg"
        max-height="40vh"
        class="my-4"
        contain
      />
      <div class="text-h6 mb-1">{{ t('markers.no_markers_title') }}</div>
      <div class="text--secondary mb-4">{{ t('markers.no_markers_hint') }}</div>
      <div class="d-flex justify-center">
        <v-btn
          color="success"
          variant="flat"
          rounded="xl"
          size="large"
          @click="openLibrary"
        >
          <v-icon start>mdi-folder-play-outline</v-icon>
          {{ t('markers.open_library') }}
        </v-btn>
      </div>
    </div>

    <div
      v-else-if="marksStore.isLoaded && marksStore.totalFiltered === 0"
      class="layout-img"
    >
      <v-img
        src="/images/filters/filters-no-results-marks.svg"
        max-height="40vh"
        class="my-4"
        contain
      />
      <div class="text--secondary mb-4">{{ t('markers.no_results') }}</div>
      <div class="d-flex justify-center">
        <v-btn
          color="primary"
          variant="flat"
          rounded="xl"
          @click="clearMarkerFilters"
        >
          <v-icon start>mdi-filter-off</v-icon>
          {{ t('markers.clear_filters') }}
        </v-btn>
      </div>
    </div>

    <div
      v-if="marksStore.marksOnPage.length && !marksStore.hasMore && marksStore.totalFiltered > 0"
      class="scroll-top-after-items d-flex justify-center my-8"
    >
      <v-btn
        @click="scrollTop"
        color="primary"
        rounded
        variant="outlined"
      >
        <v-icon start>mdi-format-vertical-align-top</v-icon>
        {{ t('items.scroll_to_top') }}
      </v-btn>
    </div>

    <div
      v-if="marksStore.marksOnPage.length && marksStore.hasMore && (marksStore.isLoadingMore || showInfiniteLoader)"
      class="infinite-loader-full-height"
    >
      <Loading v-intersect="infiniteScrolling"/>
    </div>

    <Transition name="markers-selection">
      <div
        v-if="clipStudioMode && selectedOrder.length"
        class="markers-reel-tray"
      >
        <div class="markers-reel-tray__inner">
          <div class="markers-reel-tray__header d-flex align-center justify-space-between ga-2 flex-wrap">
            <div class="text-body-2">
              <strong>{{ t('markers.reel_title') }}</strong>
              <span class="text-medium-emphasis ml-2">
                {{ t('markers.selected_count', {count: selectedOrder.length}) }}
                <template v-if="selectedRangedIds.length !== selectedOrder.length">
                  · {{ t('markers.clips_in_selection', {count: selectedRangedIds.length}) }}
                </template>
                <template v-if="selectedClipsDurationLabel">
                  · {{ selectedClipsDurationLabel }}
                </template>
              </span>
            </div>
            <div class="d-flex align-center ga-2 flex-wrap">
              <v-btn
                color="primary"
                variant="flat"
                rounded="xl"
                size="small"
                :disabled="!selectedRangedIds.length || playingClips || exportingClips"
                :loading="playingClips"
                @click="playSelectedClips"
              >
                <v-icon start>mdi-playlist-play</v-icon>
                {{ t('markers.play_selected_clips', {count: selectedRangedIds.length}) }}
              </v-btn>
              <v-menu>
                <template #activator="{ props: menuProps }">
                  <v-btn
                    v-bind="menuProps"
                    color="secondary"
                    variant="tonal"
                    rounded="xl"
                    size="small"
                    :disabled="!selectedRangedIds.length || playingClips || exportingClips"
                    :loading="exportingClips"
                  >
                    <v-icon start>mdi-export</v-icon>
                    {{ t('markers.export_selected_clips', {count: selectedRangedIds.length}) }}
                    <v-icon end>mdi-menu-down</v-icon>
                  </v-btn>
                </template>
                <v-list
                  density="compact"
                  class="markers-reel-tray__export-menu"
                >
                  <v-list-item
                    :title="t('markers.export_mode_concat')"
                    prepend-icon="mdi-filmstrip"
                    @click="exportSelectedClips('concat')"
                  />
                  <v-list-item
                    :title="t('markers.export_mode_folder')"
                    prepend-icon="mdi-folder-multiple-outline"
                    @click="exportSelectedClips('folder')"
                  />
                </v-list>
              </v-menu>
              <v-btn
                color="error"
                variant="tonal"
                rounded="xl"
                size="small"
                :disabled="!selectedOrder.length || deletingSelected"
                :loading="deletingSelected"
                @click="deleteConfirmOpen = true"
              >
                <v-icon start>mdi-delete-outline</v-icon>
                {{ t('markers.delete_selected', {count: selectedOrder.length}) }}
              </v-btn>
              <v-btn
                variant="text"
                rounded="xl"
                size="small"
                @click="clearSelection"
              >
                <v-icon start>mdi-close</v-icon>
                {{ t('markers.clear_selection') }}
              </v-btn>
            </div>
          </div>

          <draggable
            v-model="reelMarks"
            item-key="id"
            class="markers-reel-tray__list"
            :animation="180"
            ghost-class="markers-reel-tray__ghost"
            @end="onReelReorder"
          >
            <template #item="{ element, index }">
              <div class="markers-reel-tray__card">
                <div class="markers-reel-tray__thumb">
                  <v-img
                    :src="reelThumbUrl(element)"
                    :aspect-ratio="16 / 9"
                    cover
                  >
                    <template #error>
                      <v-img
                        src="/images/unavailable.png"
                        :aspect-ratio="16 / 9"
                        cover
                      />
                    </template>
                  </v-img>
                  <span class="markers-reel-tray__index">{{ index + 1 }}</span>
                  <span v-if="reelClipDuration(element)" class="markers-reel-tray__dur">
                    {{ reelClipDuration(element) }}
                  </span>
                </div>
                <div class="markers-reel-tray__name text-caption text-truncate">
                  {{ element.medium?.name || element.medium?.basename || `#${element.id}` }}
                </div>
              </div>
            </template>
          </draggable>
          <div class="text-caption text-medium-emphasis mt-1">
            {{ t('markers.reel_reorder_hint') }}
          </div>
        </div>
      </div>
    </Transition>

    <DialogConfirm
      :dialog="deleteConfirmOpen"
      variant="delete"
      :text="t('markers.delete_selected_confirm', {count: selectedOrder.length})"
      :check-box-text="t('actions.delete_permanently')"
      :check-box="deletePermanently"
      @update:check-box="deletePermanently = $event"
      @close="deleteConfirmOpen = false; deletePermanently = false"
      @confirm="confirmDeleteSelected"
    />
  </v-container>
</template>

<script setup lang="ts">
import {ref, computed, watch, onMounted, onBeforeUnmount, nextTick} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRouter} from 'vue-router'
import {useDisplay} from 'vuetify'
import draggable from 'vuedraggable'
import {useMarksStore} from '@/stores/marks'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {usePlayerStore} from '@/stores/player'
import {getDefaultMediaTypeId} from '@/utils/mediaType'
import {MARK_SORT_PARAMS} from '@/utils/markSort'
import {scrollMainTo} from '@/utils/mainScroll'
import useMarkImageGenerator from '@/composable/GeneratingThumbsForMarks'
import {useStickyControlDeck} from '@/composable/useStickyControlDeck'
import ItemMarker from '@/components/items/ItemMarker.vue'
import Loading from '@/components/elements/Loading.vue'
import DialogConfirm from '@/components/dialogs/DialogConfirm.vue'
import {typedApi} from '@/services/typedApi'
import {setNotification} from '@/services/notificationService'
import {runMarkClipsExport} from '@/services/exportMarkClipsUi'
import {loadMarkIdClipsForPlayback} from '@/services/tagClipsPlayback'
import {getReadableDuration} from '@/services/formatUtils'
import {getErrorResponseData} from '@/types/vue'
import {loadMarkImageDisplayUrl} from '@/utils/markThumb'
import {useEventBus} from '@/utils/eventBus'
import type {MarkItem} from '@/types/stores'

const {t} = useI18n()
const router = useRouter()
const {smAndDown} = useDisplay()
const marksStore = useMarksStore()
const appStore = useAppStore()
const itemsStore = useItemsStore()
const playerStore = usePlayerStore()
const eventBus = useEventBus()

useMarkImageGenerator()

function syncMarkersItemsStore() {
  itemsStore.type = 'mark'
  itemsStore.entities = marksStore.marksOnPage as typeof itemsStore.entities
  itemsStore.itemsOnPage = marksStore.marksOnPage as typeof itemsStore.itemsOnPage
  itemsStore.totalFiltered = marksStore.totalFiltered
}

watch(
  () => [marksStore.marksOnPage, marksStore.totalFiltered] as const,
  () => {
    if (itemsStore.type === 'mark') syncMarkersItemsStore()
  },
  {deep: true},
)

const searchInput = ref(marksStore.search || '')
const showInfiniteLoader = ref(false)
const {
  controlDeckSentinel,
  controlDeckClass,
} = useStickyControlDeck()
/** Selection order (first selected = first in reel). */
const selectedOrder = ref<number[]>([])
const selectedMarkCache = ref(new Map<number, MarkItem>())
const reelThumbUrls = ref(new Map<number, string>())
const lastSelectedId = ref<number | null>(null)
/** Clip Studio selection / reel mode (checkboxes + locked clips-only). */
const clipStudioMode = ref(false)
/** Visual mode for reel controls; play/export always follow tray (`selection`) order. */
const clipSort = ref<'selection' | 'shuffle'>('selection')
const playingClips = ref(false)
const exportingClips = ref(false)
const deletingSelected = ref(false)
const deleteConfirmOpen = ref(false)
const deletePermanently = ref(false)

const selectedIdSet = computed(() => new Set(selectedOrder.value))

const rangedIdsOnPage = computed(() =>
  marksStore.marksOnPage
    .filter((mark) => typeof mark.end === 'number')
    .map((mark) => Number(mark.id))
    .filter((id) => Number.isFinite(id) && id > 0),
)

const rangedIdSetOnPage = computed(() => new Set(rangedIdsOnPage.value))

const selectedRangedIds = computed(() =>
  selectedOrder.value.filter((id) => {
    const cached = selectedMarkCache.value.get(id)
    if (cached && typeof cached.end === 'number') return true
    return rangedIdSetOnPage.value.has(id)
  }),
)

const reelMarks = computed({
  get: () => selectedRangedIds.value
    .map((id) => selectedMarkCache.value.get(id))
    .filter((mark): mark is MarkItem => Boolean(mark)),
  set: (next: MarkItem[]) => {
    const rangedSet = new Set(selectedRangedIds.value)
    const reorderedRanged = next.map((mark) => Number(mark.id)).filter((id) => rangedSet.has(id))
    const nonRanged = selectedOrder.value.filter((id) => !rangedSet.has(id))
    selectedOrder.value = [...reorderedRanged, ...nonRanged]
  },
})

const selectedClipsDurationSec = computed(() => {
  let total = 0
  for (const id of selectedRangedIds.value) {
    const mark = selectedMarkCache.value.get(id)
    if (!mark || typeof mark.end !== 'number') continue
    const start = Number(mark.time) || 0
    total += Math.max(0, mark.end - start)
  }
  return total
})

const selectedClipsDurationLabel = computed(() => {
  if (selectedClipsDurationSec.value <= 0) return ''
  return getReadableDuration(selectedClipsDurationSec.value)
})

function cacheMark(id: number) {
  const mark = marksStore.marksOnPage.find((item) => Number(item.id) === id)
  if (mark) {
    const next = new Map(selectedMarkCache.value)
    next.set(id, mark)
    selectedMarkCache.value = next
    void ensureReelThumb(mark)
  }
}

async function ensureReelThumb(mark: MarkItem) {
  const markId = Number(mark.id)
  if (!Number.isFinite(markId) || markId <= 0) return
  if (reelThumbUrls.value.has(markId)) return
  try {
    const medium = mark.medium as {id?: number} | undefined
    const url = await loadMarkImageDisplayUrl({
      markId,
      mediaPath: appStore.mediaPath,
      mediaId: medium?.id || Number(mark.mediaId) || undefined,
    })
    if (!selectedIdSet.value.has(markId)) return
    const next = new Map(reelThumbUrls.value)
    next.set(markId, url)
    reelThumbUrls.value = next
  } catch {
    if (!selectedIdSet.value.has(markId)) return
    const next = new Map(reelThumbUrls.value)
    next.set(markId, '/images/unavailable.png')
    reelThumbUrls.value = next
  }
}

function addToSelection(id: number) {
  if (selectedIdSet.value.has(id)) return
  selectedOrder.value = [...selectedOrder.value, id]
  cacheMark(id)
}

function removeFromSelection(id: number) {
  selectedOrder.value = selectedOrder.value.filter((item) => item !== id)
  const next = new Map(selectedMarkCache.value)
  next.delete(id)
  selectedMarkCache.value = next
  const thumbs = new Map(reelThumbUrls.value)
  thumbs.delete(id)
  reelThumbUrls.value = thumbs
}

function toggleSelected(
  id: number,
  selected: boolean,
  meta?: {shiftKey?: boolean},
) {
  if (!clipStudioMode.value) return
  if (!Number.isFinite(id) || id <= 0) return

  if (meta?.shiftKey && lastSelectedId.value != null) {
    const ids = rangedIdsOnPage.value
    const from = ids.indexOf(lastSelectedId.value)
    const to = ids.indexOf(id)
    if (from >= 0 && to >= 0) {
      const [start, end] = from < to ? [from, to] : [to, from]
      for (let i = start; i <= end; i += 1) addToSelection(ids[i]!)
      lastSelectedId.value = id
      return
    }
  }

  if (selected) addToSelection(id)
  else removeFromSelection(id)
  lastSelectedId.value = id
}

function isMarkSelected(id: number) {
  if (itemsStore.isSelect) return itemsStore.selection.includes(id)
  return clipStudioMode.value && selectedIdSet.value.has(id)
}

function onMarkCardSelect(
  id: number,
  selected: boolean,
  meta?: {shiftKey?: boolean},
) {
  if (itemsStore.isSelect) {
    itemsStore.toggleSelect(
      meta?.shiftKey ? ({shiftKey: true} as MouseEvent) : null,
      {id},
    )
    return
  }
  toggleSelected(id, selected, meta)
}

function selectAllRangedOnPage() {
  if (!clipStudioMode.value) return
  for (const id of rangedIdsOnPage.value) addToSelection(id)
  lastSelectedId.value = rangedIdsOnPage.value[rangedIdsOnPage.value.length - 1] ?? null
}

function clearSelection() {
  selectedOrder.value = []
  selectedMarkCache.value = new Map()
  reelThumbUrls.value = new Map()
  lastSelectedId.value = null
}

async function toggleClipStudioMode() {
  if (clipStudioMode.value) {
    clipStudioMode.value = false
    clearSelection()
    deleteConfirmOpen.value = false
    return
  }
  clipStudioMode.value = true
  if (!marksStore.clipsOnly) {
    await marksStore.setClipsOnly(true)
  }
}

async function confirmDeleteSelected() {
  const ids = [...selectedOrder.value]
  if (!ids.length || deletingSelected.value) return
  const permanent = deletePermanently.value
  deletingSelected.value = true
  deleteConfirmOpen.value = false
  deletePermanently.value = false
  let deleted = 0
  try {
    for (const id of ids) {
      try {
        await typedApi.deleteMark(id, {permanent})
        deleted += 1
      } catch (error) {
        console.warn('Failed deleting mark', id, error)
      }
    }
    clearSelection()
    await marksStore.reloadMarks()
    if (deleted > 0) {
      setNotification({
        type: 'success',
        title: permanent
          ? t('markers.delete_selected_done', {count: deleted})
          : t('notifications_text.items_moved_to_trash'),
      })
    }
    if (deleted < ids.length) {
      setNotification({
        type: 'warning',
        title: t('markers.delete_selected_failed'),
        text: `${deleted}/${ids.length}`,
      })
    }
  } finally {
    deletingSelected.value = false
  }
}

function onReelReorder() {
  // v-model setter on reelMarks already rewrites selectedOrder.
}

function reelThumbUrl(mark: MarkItem): string {
  const markId = Number(mark.id)
  return reelThumbUrls.value.get(markId) || '/images/unavailable.png'
}

function reelClipDuration(mark: MarkItem): string {
  if (typeof mark.end !== 'number') return ''
  const start = Number(mark.time) || 0
  const length = Math.max(0, mark.end - start)
  return length > 0 ? getReadableDuration(length) : ''
}

function onSelectionKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  const target = event.target as HTMLElement | null
  if (target?.closest?.('input, textarea, [contenteditable="true"]')) return
  if (itemsStore.isSelect) {
    itemsStore.clearSelection()
    return
  }
  if (selectedOrder.value.length) {
    clearSelection()
    return
  }
  if (clipStudioMode.value) {
    void toggleClipStudioMode()
  }
}

async function onMarkersReload() {
  clearSelection()
  await marksStore.reloadMarks()
  syncMarkersItemsStore()
}

function openLibrary() {
  const id = getDefaultMediaTypeId(appStore.mediaTypes)
  void router.push(id != null ? `/media?mediaTypeId=${id}` : '/media')
}

function clearMarkerFilters() {
  searchInput.value = ''
  marksStore.setSearch('')
  marksStore.setSelectedTypes([])
  if (marksStore.clipsOnly) marksStore.setClipsOnly(false)
  clearSelection()
}

const toggleClipsOnly = () => {
  if (clipStudioMode.value) return
  marksStore.setClipsOnly(!marksStore.clipsOnly)
  clearSelection()
}

const onTypesChange = (types: string[]) => {
  marksStore.setSelectedTypes(types || [])
}

const onSortChange = (sortBy: string) => {
  if (marksStore.sortBy === sortBy) {
    toggleSortDir()
    return
  }
  marksStore.setSortBy(sortBy)
}

const toggleSortDir = () => {
  marksStore.setSortDir(marksStore.sortDir === 'asc' ? 'desc' : 'asc')
}

const applySearch = (value: string) => {
  const nextValue = value || ''
  if (nextValue === marksStore.search) return
  marksStore.setSearch(nextValue)
}

const infiniteScrolling = (isIntersecting: boolean) => {
  if (isIntersecting === false) return
  marksStore.loadNextPage()
}

const scrollTop = () => {
  scrollMainTo({top: 0, behavior: 'smooth'})
}

function setReelOrderMode() {
  clipSort.value = 'selection'
}

function shuffleReelOrder() {
  clipSort.value = 'shuffle'
  const ranged = [...selectedRangedIds.value]
  if (ranged.length < 2) return
  for (let i = ranged.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = ranged[i]!
    ranged[i] = ranged[j]!
    ranged[j] = tmp
  }
  const rangedSet = new Set(ranged)
  const nonRanged = selectedOrder.value.filter((id) => !rangedSet.has(id))
  selectedOrder.value = [...ranged, ...nonRanged]
}

const playSelectedClips = async () => {
  if (!clipStudioMode.value || !selectedRangedIds.value.length || playingClips.value) return
  playingClips.value = true
  try {
    const loaded = await loadMarkIdClipsForPlayback(async (body) => {
      const res = await typedApi.getMarkClips(body)
      return {
        items: res.data?.items || [],
        count: Number(res.data?.count ?? 0),
      }
    }, selectedRangedIds.value, 'selection')

    if (loaded.empty || !loaded.first) {
      setNotification({
        type: 'warning',
        title: t('tags.play_clips_empty_title'),
        text: t('tags.play_clips_empty_text'),
      })
      return
    }

    await itemsStore.playVideo({
      video: loaded.first,
      videos: loaded.playlist.length ? loaded.playlist : [loaded.first],
      time: loaded.first.segmentStart,
      trustPath: true,
    })
    if (loaded.playlist.length > 1) {
      playerStore.setPlaylistItems(loaded.playlist)
    }
  } catch (error) {
    setNotification({
      type: 'error',
      title: t('tags.play_clips_empty_title'),
      text: getErrorResponseData<{message?: string}>(error)?.message
        || (error instanceof Error ? error.message : String(error)),
    })
  } finally {
    playingClips.value = false
  }
}

const exportSelectedClips = async (mode: 'concat' | 'folder' = 'concat') => {
  if (!clipStudioMode.value || !selectedRangedIds.value.length || exportingClips.value) return
  exportingClips.value = true
  try {
    await runMarkClipsExport({
      scope: {markIds: selectedRangedIds.value},
      sort: 'selection',
      mode,
      countHint: selectedRangedIds.value.length,
      t: (key, params) => (params == null ? t(key) : t(key, params)),
    })
  } finally {
    exportingClips.value = false
  }
}

onMounted(async () => {
  searchInput.value = marksStore.search || ''
  syncMarkersItemsStore()
  window.addEventListener('keydown', onSelectionKeydown)
  eventBus.on('markers:reload', onMarkersReload)
  await nextTick()
  await marksStore.loadFilterMetas()
  await marksStore.fetchMarks()
  syncMarkersItemsStore()

  setTimeout(() => {
    showInfiniteLoader.value = true
  }, 500)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onSelectionKeydown)
  eventBus.off('markers:reload', onMarkersReload)
  if (itemsStore.type === 'mark') {
    itemsStore.clearSelection()
    itemsStore.type = ''
    itemsStore.entities = []
    itemsStore.itemsOnPage = []
    itemsStore.totalFiltered = 0
  }
})
</script>

<style lang="scss" scoped>
.markers-layout-container.v-container {
  padding-top: 8px;
}

.markers-page--has-selection {
  padding-bottom: 220px;
}

.markers-control-deck {
  /* Match LayoutItems / ToolbarSort deck control metrics exactly. */
  --markers-deck-control-h: 40px;

  &__controls {
    flex: 0 1 auto;
    justify-content: flex-end;
    align-items: center;
    min-width: 0;
    overflow: hidden;
  }

  &__field {
    margin-inline: 0 !important;
    flex: 0 0 auto;

    :deep(.v-input) {
      --v-input-control-height: var(--markers-deck-control-h);
      --v-input-padding-top: 0;
    }

    :deep(.v-field) {
      --v-input-control-height: var(--markers-deck-control-h);
      height: var(--markers-deck-control-h) !important;
      min-height: var(--markers-deck-control-h) !important;
      font-size: 0.75rem;
    }

    :deep(.v-field__field) {
      height: var(--markers-deck-control-h);
    }

    :deep(.v-field__input) {
      min-height: var(--markers-deck-control-h) !important;
      max-height: var(--markers-deck-control-h) !important;
      flex-wrap: nowrap !important;
      overflow: hidden;
      padding-top: 0 !important;
      padding-bottom: 0 !important;
      padding-inline: 12px 8px !important;
      align-items: center;
      font-size: 0.75rem !important;
      line-height: 1.2 !important;
    }

    :deep(.v-field__prepend-inner),
    :deep(.v-field__append-inner),
    :deep(.v-field__clearable) {
      padding-top: 0 !important;
      align-self: center;
    }

    :deep(.v-field__append-inner .v-icon),
    :deep(.v-field__prepend-inner .v-icon) {
      font-size: 16px !important;
    }

    :deep(.v-autocomplete__selection),
    :deep(.v-autocomplete__selection-text),
    :deep(.v-select__selection),
    :deep(.v-select__selection-text) {
      margin-inline-end: 0;
      max-width: 100%;
      overflow: hidden;
      white-space: nowrap !important;
      text-overflow: ellipsis;
      font-size: 0.75rem !important;
      line-height: 1.2 !important;
    }

    :deep(.v-input__prepend) {
      margin-inline-end: 4px;
      align-self: center;
      padding-top: 0 !important;
    }

    :deep(.v-input__prepend .v-btn) {
      width: var(--markers-deck-control-h) !important;
      height: var(--markers-deck-control-h) !important;
    }
  }

  &__search {
    width: 220px;
    min-width: 160px;
    max-width: 240px;
  }

  &__select-all {
    flex: 0 0 auto;
    font-size: 0.75rem !important;
  }

  &__select-all-label {
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__filters {
    padding: 8px var(--deck-pad-x, 14px) 10px;
  }

  &__clips-locked {
    cursor: default;
    opacity: 1 !important;
  }

  &__hint {
    margin-top: 4px;
    font-size: 0.75rem;
    line-height: 1.3;
  }

  &__studio-toggle {
    flex: 0 0 auto;
  }

  @media (max-width: 959px) {
    &__controls {
      flex-wrap: wrap;
    }

    &__search {
      flex: 1 1 140px;
      width: auto;
      max-width: none;
    }

    &__hint {
      display: none;
    }
  }
}

.markers-reel-tray {
  position: fixed;
  /* Stay inside v-main: drawers set --v-layout-* on the layout root. */
  left: calc(var(--v-layout-left, 0px) + 12px);
  right: calc(var(--v-layout-right, 0px) + 12px);
  bottom: calc(var(--v-layout-bottom, 0px) + 12px + env(safe-area-inset-bottom, 0px));
  z-index: 20;
  display: flex;
  justify-content: center;
  pointer-events: none;

  &__inner {
    pointer-events: auto;
    width: min(1080px, 100%);
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    border-radius: 16px;
    background: rgb(var(--v-theme-surface));
    border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
    box-shadow: 0 12px 32px -14px rgba(0, 0, 0, 0.35);
  }

  &__list {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 2px;
  }

  &__card {
    flex: 0 0 120px;
    width: 120px;
    cursor: grab;
  }

  &__thumb {
    position: relative;
    border-radius: 10px;
    overflow: hidden;
    background: rgba(var(--v-theme-on-surface), 0.08);
  }

  &__index {
    position: absolute;
    left: 4px;
    top: 4px;
    min-width: 18px;
    padding: 0 4px;
    border-radius: 6px;
    font-size: 11px;
    line-height: 18px;
    text-align: center;
    color: #fff;
    background: rgba(0, 0, 0, 0.65);
  }

  &__dur {
    position: absolute;
    right: 4px;
    bottom: 4px;
    padding: 0 4px;
    border-radius: 6px;
    font-size: 10px;
    line-height: 16px;
    color: #fff;
    background: rgba(0, 0, 0, 0.65);
  }

  &__name {
    margin-top: 4px;
    opacity: 0.85;
  }

  &__ghost {
    opacity: 0.45;
  }

  &__export-menu {
    min-width: 0;
    padding: 4px 0;

    :deep(.v-list-item) {
      min-height: 32px !important;
      padding-inline: 10px !important;
    }

    :deep(.v-list-item__prepend) {
      margin-inline-end: 8px;
    }

    :deep(.v-list-item__prepend > .v-icon),
    :deep(.v-list-item__prepend .v-icon) {
      font-size: 16px !important;
      width: 16px !important;
      height: 16px !important;
    }

    :deep(.v-list-item-title) {
      font-size: 0.8125rem;
      line-height: 1.2;
    }
  }
}

.markers-selection-enter-active,
.markers-selection-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.markers-selection-enter-from,
.markers-selection-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
