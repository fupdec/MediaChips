<template>
  <Teleport
    to="#items-filters-top-host"
    :disabled="!useTopPanel"
  >
    <div
      v-if="useTopPanel"
      class="filters-top"
    >
      <!-- No fade: Vue's leave hook forces a reflow and the 200ms opacity animation repaints every card each frame. -->
        <div
          v-show="showTopShell"
          class="filters-top__shell"
          :class="{
            'filters-top__shell--panel': isPanelView,
            'filters-top__shell--full': isPanelView,
            'filters-top__shell--simple': !isPanelView,
            'filters-top__shell--float': isPanelView,
          }"
        >
          <div
            class="filters-top__chrome"
            :class="{'filters-top__chrome--panel': isPanelView}"
          >
            <div class="filters-top__chrome-start">
              <template v-if="!isPanelView">
                <span class="filters-top__chrome-title">{{ t('filters.active_title') }}</span>
                <FiltersChips
                  :filters="ITEMS.filters"
                  class="filters-top__chips"
                />
              </template>
            </div>

            <div class="filters-top__chrome-end">
              <v-btn
                class="filters-top__chrome-more"
                icon
                size="x-small"
                variant="text"
                color="primary"
                :aria-label="t('common.more')"
                @click="openChromeMenu"
              >
                <v-icon size="18">mdi-dots-horizontal</v-icon>
              </v-btn>

              <v-btn
                v-if="!isPanelView"
                class="filters-top__chrome-edit"
                icon
                size="x-small"
                variant="text"
                color="primary"
                :aria-label="t('common.edit')"
                @click="filtersStore.visible = true"
              >
                <v-icon size="18">mdi-pencil-outline</v-icon>
              </v-btn>

              <v-btn
                v-if="isPanelView"
                class="filters-top__chrome-close"
                variant="text"
                icon
                size="x-small"
                color="primary"
                :aria-label="t('appbar.buttons.hide_filters')"
                @click="closeTopFilters"
              >
                <v-icon size="18">mdi-close</v-icon>
              </v-btn>
            </div>
          </div>

          <div class="filters-top__cols">
          <div
            v-if="isPanelView && $slots.quick"
            class="filters-top__quick"
          >
            <slot name="quick"/>
          </div>

          <div class="filters-top__main">

          <!-- No expand-transition: animating height re-lays out and repaints the whole card grid below every frame. -->
          <div
            class="filters-top__panel-slot"
            :class="{'filters-top__panel-slot--open': isPanelView}"
          >
            <div class="filters-top__panel-slot-inner">
              <div class="filters-top__panel">
                <FiltersPanel
                  v-if="topPanelMounted"
                  variant="top"
                  hide-header
                  v-bind="panelBindings"
                  @update:filters="filters = $event"
                  @close="closeTopFilters"
                  @apply="apply"
                  @apply-ai-filters="onApplyAiFilters"
                  @undo-ai-filters="undoAiFilters"
                  @add="add"
                  @reorder="onReorder"
                  @open-saved="dialogSaved = true"
                  @set-by="setBy"
                  @set-condition="setCondition"
                  @set-value="setValue"
                  @set-active="setActive"
                  @remove="remove"
                  @duplicate="duplicate"
                  @remove-all="removeAll"
                  @pick-date="pickDate"
                  @valid="validate"
                >
                  <template #conditions-head>
                    <div
                      v-if="conditionsCount >= 2"
                      class="filters-top__match"
                    >
                      <span>{{ t('filters.match_prefix') }}</span>
                      <v-menu
                        location="bottom start"
                        :transition="false"
                        content-class="filters-top__match-menu"
                        :disabled="activeConditionsCount < 2"
                      >
                        <template #activator="{props: menuProps}">
                          <button
                            v-bind="menuProps"
                            type="button"
                            class="filters-top__match-pill"
                            :disabled="activeConditionsCount < 2"
                            :title="filtersJoin === 'or' ? t('filters.join_or_hint') : t('filters.join_and_hint')"
                          >
                            {{ filtersJoin === 'or' ? t('filters.match_any') : t('filters.match_all') }}
                            <v-icon size="14">mdi-unfold-more-horizontal</v-icon>
                          </button>
                        </template>
                        <v-list density="compact">
                          <v-list-item
                            :active="filtersJoin === 'and'"
                            :title="t('filters.match_all')"
                            @click="onFiltersJoinChange('and')"
                          />
                          <v-list-item
                            :active="filtersJoin === 'or'"
                            :title="t('filters.match_any')"
                            @click="onFiltersJoinChange('or')"
                          />
                        </v-list>
                      </v-menu>
                      <span>{{ t('filters.match_suffix') }}</span>
                    </div>
                    <div
                      v-else-if="filters.length > 0"
                      class="filters-top__match"
                    >
                      <span>{{ t('filters.match_single') }}</span>
                    </div>
                  </template>
                </FiltersPanel>
              </div>
            </div>
          </div>

          <div
            v-if="isPanelView && is_filters_changed"
            class="filters-top__footer"
          >
            <span class="filters-top__pending">
              {{ t('filters.changes_not_applied', {count: filtersChangeCount}, filtersChangeCount) }}
            </span>

            <v-spacer/>

            <v-btn
              color="success"
              variant="flat"
              prepend-icon="mdi-check"
              @click="apply"
            >
              {{ t('common.apply') }}
            </v-btn>
          </div>
          </div>
          </div>
        </div>
    </div>

    <v-navigation-drawer
      v-else
      v-model="filtersVisible"
      class="filters-drawer"
      :class="{'temporary': filtersFloating}"
      :temporary="filtersFloating"
      :floating="filtersFloating"
      :scrim="false"
      disable-resize-watcher
      width="450"
    >
      <v-card
        variant="tonal"
        color="primary"
        class="filter-block"
        rounded="xl"
      >
        <FiltersPanel
          variant="drawer"
          v-bind="panelBindings"
          @update:filters="filters = $event"
          @close="filtersStore.visible = false"
          @apply="apply"
          @apply-ai-filters="onApplyAiFilters"
          @undo-ai-filters="undoAiFilters"
          @add="add"
          @reorder="onReorder"
          @open-saved="dialogSaved = true"
          @set-by="setBy"
          @set-condition="setCondition"
          @set-value="setValue"
          @set-active="setActive"
          @remove="remove"
          @duplicate="duplicate"
          @remove-all="removeAll"
          @pick-date="pickDate"
          @valid="validate"
        />
      </v-card>
    </v-navigation-drawer>
  </Teleport>

  <!-- Saved filters management -->
  <DialogFiltersSaved
    v-if="dialogSaved"
    :dialog="dialogSaved"
    :can-create="canSaveView"
    @close="dialogSaved = false"
    @apply="applySavedView"
    @save="saveCurrentAsNamed"
  />

  <!-- Date Picker Dialog -->
  <v-dialog
    v-model="datePicker.dialog"
    width="auto"
  >
    <v-date-picker
      :model-value="datePicker.value"
      :title="t('filters.select_date')"
      :header="t('filters.enter_date')"
      color="primary"
      rounded="xl"
      @update:model-value="setDate"
    />
  </v-dialog>
</template>

<script setup lang="ts">
import {ref, computed, watch, onMounted, onUnmounted, provide} from 'vue'
import {useI18n} from 'vue-i18n'
import {useDisplay} from 'vuetify'
import dayjs from 'dayjs'
import {cloneFilters, filtersEqual} from '@/utils/filterClone'
import {typedApi} from '@/services/typedApi'
import {getSavedFilters} from '@/services/filterService'
import {useItemsPageCommands} from '@/composable/itemsPageCommands'
import {
  captureSavedViewLayout,
  hasSavedViewLayout,
  pickSavedViewLayout,
} from '@/utils/savedViewLayout'
import {
  getFilterObject,
  getListCond,
} from '@/services/formatUtils'
import {useAppStore} from '@/stores/app'
import {useContextMenu} from '@/stores/contextMenu'
import {useSettingsStore} from '@/stores/settings'
import {setOption} from '@/services/settingsService'
import type {ContextMenuEntry} from '@/types/stores'
import {useItemsStore} from '@/stores/items'
import type { FilterObject, FilterListParam } from '@/types/common'
import type { SavedFilter } from '@/types/stores'
import {
  getCurrentMediaType,
  isImageMediaType,
  isVideoMediaType,
  isAudioMediaType,
} from '@/utils/mediaType'
import {sanitizeFiltersForMediaType} from '@/utils/mediaSortFilter'
import {registerItemsFiltersController} from '@/composable/itemsFiltersController'
import {FILTER_ROW_COUNTS_KEY, useFilterRowCounts} from '@/composable/useFilterRowCounts'
import {FILTER_ROW_BASELINE_KEY, buildFilterBaselines} from '@/composable/filterRowBaseline'
import type {FilterRowCountsContext} from '@/composable/useFilterRowCounts'
import FiltersPanel from '@/components/app/FiltersPanel.vue'
import FiltersChips from '@/components/elements/FiltersChips.vue'

import cols from '../../../app/configs/filter-cols'

import DialogFiltersSaved from '@/components/dialogs/filters/DialogFiltersSaved.vue'

/**
 обозначения ключей для объекта "фильтр":
 id - уникальный номер взятый из таблицы БД,
 param - параметр, по которому будет производиться фильтрация,
 type - тип данных для фильтрации,
 cond - условие,
 val - значение,
 note - дополнительная информация,
 favorite - избранное, отображение на панели инструментов,
 active - состояние фильтра,
 lock - блокировка от удаления пользователем,
 */

// Props
interface QuickToggle {
  option: 'showAlphabetFilter' | 'showColorFilter' | 'showSavedFilters'
  title: string
}

const props = defineProps<{
  isReady?: boolean
  /** Quick-filter strips the page lets the user show or hide. */
  quickToggles?: QuickToggle[]
}>()

// Stores
const appStore = useAppStore()
const filtersStore = appStore.filters
const itemsStore = useItemsStore()
const contextMenuStore = useContextMenu()
const settingsStore = useSettingsStore()
const pageCommands = useItemsPageCommands()
const {t} = useI18n()
const {width} = useDisplay()

const useTopPanel = computed(() => true)

/** Dock filters when there is room for sidebar + drawer + content; otherwise float. */
const FILTERS_DRAWER_WIDTH = 450
const SIDEBAR_WIDTH = 280
const MIN_CONTENT_WIDTH = 640
const filtersFloating = computed(() =>
  width.value < SIDEBAR_WIDTH + FILTERS_DRAWER_WIDTH + MIN_CONTENT_WIDTH
)

// Reactive data
const updKey = ref(0)
const filters = ref<FilterObject[]>([])

const filterAiPrompt = computed(() => {
  const activeCount = filters.value.filter((row) => row.active && !row.removed).length
  const kind = ITEMS.value.type === 'tag'
    ? 'tag pages'
    : (currentMediaType.value?.type || 'media')
  if (activeCount > 0) {
    return [
      `Improve my MediaChips filters for this ${kind} library page.`,
      'Return JSON with ready-to-apply filters using only available fields.',
    ].join(' ')
  }
  return [
    `Help me design useful MediaChips filters for this ${kind} library page.`,
    'Return JSON with ready-to-apply filters using only available fields.',
  ].join(' ')
})

const filterAiContext = computed(() => {
  const fieldLabel = (param: string | number | null | undefined) => {
    const found = listBy.value.find((item) => item.param == param)
    return found ? translateFilterText(found) : String(param ?? '')
  }
  return {
    pageType: ITEMS.value.type,
    mediaKind: currentMediaType.value?.type || null,
    today: dayjs().format('YYYY-MM-DD'),
    availableFields: listBy.value.map((item) => ({
      param: item.param,
      type: item.type,
      name: translateFilterText(item),
      group: item.group || null,
    })),
    conditionsByType: {
      string: getListCond('string').map((c) => c.cond),
      number: getListCond('number').map((c) => c.cond),
      date: getListCond('date').map((c) => c.cond),
      rating: getListCond('rating').map((c) => c.cond),
      boolean: getListCond('boolean').map((c) => c.cond),
      array: getListCond('array').map((c) => c.cond),
    },
    currentFilters: filters.value
      .filter((row) => !row.removed)
      .map((row) => ({
        field: fieldLabel(row.param),
        param: row.param,
        type: row.type,
        cond: row.cond,
        val: row.val,
        active: row.active,
      })),
  }
})
const listBy = ref<FilterListParam[]>([])
const valid = ref(true)
const datePicker = ref<{
  dialog: boolean
  index: number
  value: string | null
}>({
  dialog: false,
  index: -1,
  value: null
})
const dialogSaved = ref(false)
const filtersPreviousState = ref<FilterObject[]>([])

const dragOptions = {
  animation: 200,
  ghostClass: 'filter-ghost',
}

// Computed
const filtersVisible = computed({
  get: () => filtersStore.visible,
  set: (value: boolean) => {
    filtersStore.visible = value
  },
})

const ITEMS = computed(() => itemsStore)
const ENV = computed(() => ITEMS.value.environment)

const showTopChips = computed(() => {
  const hasActive = (ITEMS.value.filters || []).some((filter) => filter && filter.active)
  const hasDuplicates = Boolean(ENV.value.media_type_id && ITEMS.value.find_duplicates)
  const hasListScope = Boolean(ITEMS.value.listScopeIds?.length)
  return hasActive || hasDuplicates || hasListScope
})

const showTopShell = computed(() => filtersVisible.value || showTopChips.value)

// The panel is always in editing mode; while it is closed, active filters show as chips.
const isPanelView = computed(() => filtersVisible.value)
// Mount the editor on first use, then retain inputs and menus across toggles.
const topPanelMounted = ref(false)
watch(isPanelView, (open) => {
  if (open) topPanelMounted.value = true
}, {immediate: true})

const filtersJoin = computed(() => itemsStore.filtersJoin === 'or' ? 'or' : 'and')

/** AND/OR is shown with two or more conditions and works once two are on. */
const conditionsCount = computed(() =>
  filters.value.filter((filter) => !filter.removed).length,
)
const activeConditionsCount = computed(() =>
  filters.value.filter((filter) => filter.active && !filter.removed).length,
)

const onFiltersJoinChange = (value: unknown) => {
  const next = value === 'or' ? 'or' : 'and'
  if (itemsStore.filtersJoin === next) return
  itemsStore.filtersJoin = next
  apply()
}

const panelBindings = computed(() => ({
  editMode: true,
  filters: filters.value,
  listBy: listBy.value,
  isReady: props.isReady,
  isFiltersChanged: is_filters_changed.value,
  filterAiPrompt: filterAiPrompt.value,
  filterAiContext: filterAiContext.value as Record<string, unknown>,
  dragOptions,
  assistActive: useTopPanel.value
    ? (showTopShell.value && isPanelView.value)
    : filtersVisible.value,
  canUndoAiFilters: aiUndoSnapshot.value != null,
}))

const currentMediaType = computed(() =>
  getCurrentMediaType(appStore.mediaTypes, ENV.value.media_type_id)
)

// Live "matches on its own" counts per condition; only the media and tag pages have a list endpoint.
const rowCountsContext = computed<FilterRowCountsContext | null>(() => {
  if (ITEMS.value.type === 'tag' && ENV.value.meta_id != null) {
    return {url: '/api/tag/items/', metaId: ENV.value.meta_id}
  }
  if (ITEMS.value.type === 'media' && ENV.value.media_type_id != null) {
    return {url: '/api/media/items', mediaTypeId: ENV.value.media_type_id}
  }
  return null
})
const filterRowCounts = useFilterRowCounts(filters, rowCountsContext, computed(() => Boolean(filtersStore.visible)))
provide(FILTER_ROW_COUNTS_KEY, filterRowCounts)
provide(FILTER_ROW_BASELINE_KEY, computed(() => buildFilterBaselines(filtersPreviousState.value)))

const is_filters_changed = computed(() =>
  !filtersEqual(filtersPreviousState.value, filters.value),
)

/** Rows added, edited or removed since the filters were last applied. */
const filtersChangeCount = computed(() => {
  const keyOf = (filter: FilterObject) => String(filter.id ?? filter.clientKey)
  const previous = new Map(filtersPreviousState.value.map((filter) => [keyOf(filter), filter]))
  let count = 0
  for (const filter of filters.value) {
    const before = previous.get(keyOf(filter))
    if (!before || JSON.stringify(before) !== JSON.stringify(filter)) count += 1
  }
  const current = new Set(filters.value.map(keyOf))
  for (const key of previous.keys()) {
    if (!current.has(key)) count += 1
  }
  return Math.max(count, 1)
})

const hasSavableFilters = computed(() =>
  filters.value.some((filter) => !filter.removed && !filter.lock),
)

/** Views can be saved with filters and/or current sort/group/card size. */
const canSaveView = computed(() => true)

// Methods
const filterTextKeys: Record<string, string> = {
  rating: 'filters.sort.rating',
  favorite: 'meta.sorting.favorite',
  bookmark: 'player.controls.bookmark',
  views: 'filters.sort.views',
  viewedAt: 'filters.sort.viewed_date',
  createdAt: 'filters.sort.date_added',
  updatedAt: 'filters.sort.date_updated',
  name: 'filters.sort.name',
  synonyms: 'filters.sort.synonyms',
  country: 'meta.types.country',
  color: 'settings_labels.appearance.colors',
  path: 'filters.sort.file_path',
  filesize: 'filters.sort.filesize',
  ext: 'filters.sort.file_format',
  duration: 'filters.sort.duration',
  width: 'filters.sort.width',
  height: 'filters.sort.height',
  bitrate: 'filters.sort.bitrate',
  fps: 'filters.sort.framerate',
  codec: 'filters.sort.codec',
}

const withFilterI18n = (items: FilterListParam[], group: string): FilterListParam[] => items.map(item => ({
  ...item,
  group,
  textKey: filterTextKeys[String(item.param)],
}))

const translateFilterText = (item: FilterListParam): string => item.textKey ? t(item.textKey) : (item.text ?? '')

const init = () => {
  let listByArray: FilterListParam[] = []

  if (ITEMS.value.type === 'media') {
    const media = withFilterI18n(cols.media || [], "File")
    media.sort((a, b) => translateFilterText(a) > translateFilterText(b) ? 1 : translateFilterText(b) > translateFilterText(a) ? -1 : 0)
    listByArray = [...listByArray, ...media]

    if (isVideoMediaType(currentMediaType.value)) {
      const video = withFilterI18n(cols.video || [], "Video")
      video.sort((a, b) => translateFilterText(a) > translateFilterText(b) ? 1 : translateFilterText(b) > translateFilterText(a) ? -1 : 0)
      listByArray = [...listByArray, ...video]
    }

    if (isImageMediaType(currentMediaType.value)) {
      const image = withFilterI18n(cols.image || [], t('media.type_names.image'))
      image.sort((a, b) => translateFilterText(a) > translateFilterText(b) ? 1 : translateFilterText(b) > translateFilterText(a) ? -1 : 0)
      listByArray = [...listByArray, ...image]
    }

    if (isAudioMediaType(currentMediaType.value)) {
      const audio = withFilterI18n(cols.audio || [], t('media.type_names.audio'))
      audio.sort((a, b) => translateFilterText(a) > translateFilterText(b) ? 1 : translateFilterText(b) > translateFilterText(a) ? -1 : 0)
      listByArray = [...listByArray, ...audio]
    }
  } else if (ITEMS.value.type === 'tag') {
    const metaTag = withFilterI18n(cols.metaTag || [], "Tag")
    metaTag.sort((a, b) => translateFilterText(a) > translateFilterText(b) ? 1 : translateFilterText(b) > translateFilterText(a) ? -1 : 0)
    listByArray = [...listByArray, ...metaTag]
  }

  // так называемые заводские фильтры, типа закладок, даты создания, избранное...
  const defaults = withFilterI18n(cols.standart || [], "Preset meta")
  defaults.sort((a, b) => translateFilterText(a) > translateFilterText(b) ? 1 : translateFilterText(b) > translateFilterText(a) ? -1 : 0)
  listByArray = [...listByArray, ...defaults]

  const pinned = ITEMS.value.assigned;

  for (const i of pinned) {
    if (i.meta && i.meta.id) {
      listByArray.push({
        param: i.meta.id,
        type: i.meta.type || 'array',
        icon: i.meta.icon || 'mdi-tag',
        text: i.meta.name || t('meta.unnamed_tag'),
        group: "Pinned meta",
      });
    }
  }

  listBy.value = listByArray
  const nextFilters = sanitizeFiltersForMediaType(
    cloneFilters(ITEMS.value.filters),
    ITEMS.value.type,
    currentMediaType.value
  )
  nextFilters.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
  nextFilters.forEach((filter) => {
    if (filter.id == null && !filter.clientKey) {
      filter.clientKey = Math.random().toString(16).slice(2)
    }
  })
  filters.value = nextFilters
  sortByActivity()
  filtersPreviousState.value = cloneFilters(filters.value)
}

const add = (params: Array<FilterListParam & {cond?: string}>) => {
  for (const i of params) {
    const conditions = getListCond(i.type ?? null)
    // A preset may ask for a specific condition (e.g. "under folder"); otherwise the first one fits.
    const cond = conditions.find((option) => option.cond === i.cond)?.cond ?? conditions?.[0]?.cond ?? null
    const filter_obj = getFilterObject({
      param: String(i.param),
      type: i.type ?? null,
      cond,
      order: filters.value.length,
    })
    filters.value.push(filter_obj)
  }
}

const pickBestTagMatch = (
  items: Array<{id?: number | string, name?: string | null}>,
  query: string,
): number | null => {
  const needle = query.trim().toLowerCase()
  if (!needle || !items.length) return null
  const exact = items.find((item) => String(item.name || '').trim().toLowerCase() === needle)
  if (exact?.id != null && Number.isFinite(Number(exact.id))) return Number(exact.id)
  const starts = items.find((item) => String(item.name || '').trim().toLowerCase().startsWith(needle))
  if (starts?.id != null && Number.isFinite(Number(starts.id))) return Number(starts.id)
  const first = items[0]
  if (first?.id != null && Number.isFinite(Number(first.id))) return Number(first.id)
  return null
}

const resolveArrayFilterVal = async (
  raw: unknown,
  metaId: number | undefined,
): Promise<number[] | null> => {
  if (raw == null) return null
  const parts = Array.isArray(raw)
    ? raw
    : (typeof raw === 'object'
      ? Object.values(raw as Record<string, unknown>)
      : [raw])
  const ids: number[] = []
  const unresolved: string[] = []

  for (const part of parts) {
    if (typeof part === 'number' && Number.isFinite(part)) {
      ids.push(part)
      continue
    }
    const text = String(part ?? '').trim()
    if (!text) continue
    if (/^\d+$/.test(text)) {
      ids.push(Number(text))
      continue
    }
    try {
      const response = await typedApi.searchTags({
        q: text,
        limit: 8,
        ...(metaId != null && Number.isFinite(metaId) ? {metaId} : {}),
      })
      const matched = pickBestTagMatch(response.data || [], text)
      if (matched != null) ids.push(matched)
      else unresolved.push(text)
    } catch {
      unresolved.push(text)
    }
  }

  if (unresolved.length && typeof window !== 'undefined' && window.showNotification) {
    window.showNotification(
      t('settings_labels.local_ai.assist_tag_unresolved', {
        names: unresolved.slice(0, 3).join(', '),
      }),
      'warning',
    )
  }

  return ids.length ? [...new Set(ids)] : null
}

const applyAiFilters = async (payload: Record<string, unknown>) => {
  const rows = Array.isArray(payload?.filters) ? payload.filters : []
  let added = 0
  for (const entry of rows) {
    if (!entry || typeof entry !== 'object') continue
    const row = entry as Record<string, unknown>
    const param = row.param
    if (param == null || param === '') continue
    const field = listBy.value.find((item) => String(item.param) === String(param))
    const type = String(field?.type || row.type || 'string')
    const allowed = getListCond(type).map((item) => item.cond)
    let cond = String(row.cond || '')
    if (type === 'boolean' && (cond === '!==' || cond === '≠')) cond = '!='
    if (!cond || !allowed.includes(cond)) continue

    let val: unknown = row.val ?? null
    const metaId = typeof (field?.param ?? param) === 'number'
      || /^\d+$/.test(String(field?.param ?? param))
      ? Number(field?.param ?? param)
      : undefined

    if (type === 'array' && cond !== 'is null' && cond !== 'not null') {
      if (metaId != null && Number.isFinite(metaId)) {
        val = await resolveArrayFilterVal(val, metaId)
        if (!Array.isArray(val) || !val.length) continue
      } else {
        const parts = Array.isArray(val)
          ? val
          : (typeof val === 'object' && val
            ? Object.values(val as Record<string, unknown>)
            : [val])
        val = parts
          .map((part) => String(part ?? '').trim().replace(/^\./, '').toLowerCase())
          .filter(Boolean)
        if (!Array.isArray(val) || !val.length) continue
      }
    }

    const filter_obj = getFilterObject({
      param: field ? field.param : param as string | number,
      type: field?.type ?? type,
      cond,
      val,
      active: true,
      order: filters.value.length,
      metaId,
    })
    filters.value.push(filter_obj)
    added += 1
  }
  if (!added) return 0
  filtersStore.visible = true
  return added
}

const aiUndoSnapshot = ref<FilterObject[] | null>(null)

const onApplyAiFilters = async (payload: Record<string, unknown>) => {
  aiUndoSnapshot.value = cloneFilters(filters.value)
  if (payload?.replace === true) {
    filters.value = filters.value.filter((filter) => Boolean(filter.lock) || Boolean(filter.removed))
  }
  const added = await applyAiFilters(payload)
  if (payload?.run === true) {
    await apply()
  }
  if (added && typeof window !== 'undefined' && window.showNotification) {
    window.showNotification(
      t('settings_labels.local_ai.assist_applied', {count: added}),
      'success',
    )
  }
}

const undoAiFilters = async () => {
  if (!aiUndoSnapshot.value) return
  filters.value = cloneFilters(aiUndoSnapshot.value)
  aiUndoSnapshot.value = null
  await apply()
}

const reindexFilterOrder = () => {
  filters.value.forEach((filter, index) => {
    filter.order = index
  })
}

const onReorder = () => {
  reindexFilterOrder()
}

const setBy = (value: string | number, index: number) => {
  filters.value[index].param = value
  const found = listBy.value.findIndex(i => i.param === value)
  if (found > -1) filters.value[index].type = listBy.value[found].type ?? null
  filters.value[index].cond = null
  filters.value[index].val = null
  if (typeof value === "number") filters.value[index].metaId = value
}

const setCondition = (value: string | null, index: number) => {
  filters.value[index].cond = value
}

const setValue = (value: unknown, index: number) => {
  filters.value[index].val = value
}

// Turned-on conditions first, turned-off ones below; order inside each group is kept.
const sortByActivity = () => {
  filters.value = [...filters.value].sort((a, b) => Number(!a.active) - Number(!b.active))
  reindexFilterOrder()
}

const setActive = (value: boolean, index: number) => {
  filters.value[index].active = value
  sortByActivity()
}

const remove = (index: number) => {
  filters.value[index].removed = !filters.value[index].removed
  updKey.value += Date.now()
}

const duplicate = (index: number) => {
  const source = filters.value[index]
  if (!source || source.lock) return
  const copy = cloneFilters([source])[0]
  copy.id = null
  copy.clientKey = Math.random().toString(16).slice(2)
  copy.removed = false
  filters.value.splice(index + 1, 0, copy)
  reindexFilterOrder()
  updKey.value += Date.now()
}

const removeAll = (state?: boolean) => {
  const is_removed = state === undefined ? true : state
  filters.value.forEach(i => {
    if (!i.lock) i.removed = is_removed
  })
  updKey.value += Date.now()
}

const deactivateAll = (state?: boolean) => {
  const is_active = state === undefined ? false : state
  const updatedFilters = filters.value.map(i =>
    i.lock ? i : {...i, active: is_active}
  )
  filters.value = cloneFilters(updatedFilters)
  updKey.value += Date.now()
}

const validateFilters = () => {
  if (filters.value.length === 0) {
    valid.value = true
  }
}

const apply = async () => {
  validateFilters()
  if (!valid.value) {
    return
  }

  const savedFilter = ITEMS.value.savedFilter
  const join = itemsStore.filtersJoin === 'or' ? 'or' : 'and'

  // Independent writes: run them together so the list reload doesn't wait for a
  // chain of sequential round trips (one per filter row).
  const removedIds = filters.value.filter(i => i.removed && i.id).map(i => i.id as number)
  const saveJoin = async () => {
    if (!savedFilter?.id) return
    try {
      await typedApi.updateSavedFilter(Number(savedFilter.id), {filtersJoin: join})
      itemsStore.updateState({
        key: 'savedFilter',
        value: {...savedFilter, filtersJoin: join},
      })
    } catch (error) {
      console.error('Error saving filtersJoin:', error)
    }
  }
  await Promise.all([
    addFilterRows(savedFilter?.id),
    ...removedIds.map((id) => typedApi.deleteFilterRow(id)),
    saveJoin(),
  ])

  itemsStore.updateState({key: "filters", value: cloneFilters(filters.value)})
  await Promise.resolve(pageCommands.setFilters({filters: filters.value}))
}

const addFilterRows = async (filterId: number | null | undefined, isSavedFilter = false) => {
  const jobs: Array<Promise<void>> = []
  for (let index = 0; index < filters.value.length; index++) {
    const filter = filters.value[index]
    if (filter.lock || filter.removed) continue

    const payload = cloneFilters([{...filter, order: index}])[0]
    if (isSavedFilter) payload.id = null

    jobs.push((async () => {
      try {
        const response = await typedApi.createFilterRow({
          filter: payload,
          filterId: filterId,
          rowId: isSavedFilter ? null : payload.id,
        })
        const created = response.data
        if (!isSavedFilter && created?.id != null) {
          filter.id = created.id
          filter.order = index
        }
      } catch (error) {
        console.error('Error adding filter row:', error)
      }
    })())
  }
  await Promise.all(jobs)
}

const saveCurrentAsNamed = async (name: string, icon?: string) => {
  const trimmed = String(name || '').trim()
  if (!trimmed) return

  const layout = captureSavedViewLayout(itemsStore)
  let savedFilter: SavedFilter = { id: 0 }

  try {
    const response = await typedApi.createSavedFilter({
      name: trimmed,
      mediaTypeId: ENV.value.media_type_id ?? null,
      metaId: ENV.value.meta_id ?? null,
      tagId: ENV.value.tag_id ?? null,
      tabId: ENV.value.tab_id ?? null,
      sortBy: layout.sortBy,
      sortDir: layout.sortDir,
      size: layout.size,
      view: layout.view == null ? null : Number(layout.view),
      groupBy: layout.groupBy,
      filtersJoin: layout.filtersJoin,
      icon: icon ?? null,
    })
    const data = response.data
    savedFilter = Array.isArray(data) ? data[0] : data
  } catch (error) {
    console.error('Error saving view:', error)
    return
  }

  if (savedFilter?.id && hasSavableFilters.value) {
    await addFilterRows(savedFilter.id, true)
  }

  await getSavedFilters()
}

const loadSavedFilter = (loadedFilters: FilterObject[]) => {
  dialogSaved.value = false
  removeAll()
  const old_filters = cloneFilters(filters.value.filter(i => !i.lock))
  const incoming = loadedFilters.map((filter, index) => getFilterObject({
    ...filter,
    id: null,
    order: index,
  }))
  filters.value = [...incoming, ...old_filters]
  reindexFilterOrder()
  updKey.value += Date.now()
}

const applySavedView = async (savedFilter: SavedFilter) => {
  const layout = pickSavedViewLayout(savedFilter as Record<string, unknown>)
  if (hasSavedViewLayout(layout)) {
    await pageCommands.applySavedViewLayout(layout)
  }
  loadSavedFilter(
    (savedFilter.filters || []).map((filter) => ({...filter, id: null})),
  )
  await apply()
}

const pickDate = (index: number) => {
  datePicker.value.dialog = true
  datePicker.value.value = filters.value[index].val as string | null
  datePicker.value.index = index
}

const setDate = (date: string | Date | null) => {
  datePicker.value.dialog = false
  filters.value[datePicker.value.index].val = dayjs(date).format('YYYY-MM-DD')
}

const validate = (val: boolean) => {
  valid.value = val
}

// Event listeners
const handleApplySavedFilter = async (filtersPayload: unknown) => {
  // Chips path may pass FilterObject[] (layout already applied) or a full SavedFilter.
  if (
    filtersPayload
    && typeof filtersPayload === 'object'
    && !Array.isArray(filtersPayload)
    && 'filters' in (filtersPayload as SavedFilter)
  ) {
    await applySavedView(filtersPayload as SavedFilter)
    return
  }
  loadSavedFilter(filtersPayload as FilterObject[])
  await apply()
}

const handleDeactivateFilter = (index: number) => {
  filters.value[index].active = false
  void apply()
}

const handleDeactivateAllFilters = () => {
  deactivateAll()
  void apply()
}

/** The "⋯" menu uses the app's context menu so it looks and behaves like every other one. */
const openChromeMenu = (event: MouseEvent) => {
  const target = event.currentTarget as HTMLElement | null
  const rect = target?.getBoundingClientRect()
  const content: ContextMenuEntry[] = [
    {
      name: t('filters.manage_saved_views'),
      type: 'item',
      icon: 'content-save-outline',
      action: () => { dialogSaved.value = true },
    },
  ]

  const toggles = props.quickToggles ?? []
  if (toggles.length) {
    content.push({type: 'divider'})
    for (const toggle of toggles) {
      const on = settingsStore[toggle.option] === '1'
      content.push({
        name: toggle.title,
        type: 'item',
        icon: on ? 'checkbox-marked-outline' : 'checkbox-blank-outline',
        action: () => { void setOption(on ? '0' : '1', toggle.option) },
      })
    }
  }

  content.push(
    {type: 'divider'},
    {
      name: t('filters.clear_all_filters'),
      type: 'item',
      icon: 'filter-off-outline',
      color: 'red',
      disabled: !showTopChips.value && activeConditionsCount.value === 0,
      action: () => handleDeactivateAllFilters(),
    },
  )

  contextMenuStore.showContextMenu({
    content,
    x: rect ? rect.right : event.clientX,
    y: rect ? rect.bottom + 4 : event.clientY,
  })
}

const closeTopFilters = () => {
  filtersStore.visible = false
}

let unregisterFiltersController: (() => void) | null = null

// Lifecycle
onMounted(() => {
  unregisterFiltersController = registerItemsFiltersController({
    apply,
    applySaved: handleApplySavedFilter,
    deactivate: handleDeactivateFilter,
    deactivateAll: handleDeactivateAllFilters,
  })

  if (props.isReady) init()
})

onUnmounted(() => {
  unregisterFiltersController?.()
  unregisterFiltersController = null
})

// Watchers
watch(() => itemsStore.filters, (val) => {
  filters.value = cloneFilters(val)
  filtersPreviousState.value = cloneFilters(val)
  updKey.value += Date.now()
}, {deep: true})

watch(() => props.isReady, (val) => {
  if (val) init()
})

watch(currentMediaType, () => {
  if (props.isReady && ITEMS.value.type === 'media') init()
})

</script>

<style lang="scss">
.filters-top {
  width: 100%;
  margin-bottom: 0;
}

.filters-top__shell {
  width: 100%;
  border: 1px solid rgba(var(--v-theme-primary), 0.18);
  border-radius: 16px;
  background: rgb(var(--v-theme-surface));
  overflow: hidden;
}

.items-control-deck--browser .filters-top {
  margin-bottom: 0;
}

.items-control-deck--browser .filters-top__shell {
  border: 0;
  border-radius: 0;
  /* Same tint as the appearance block above (ToolbarAppearance__deck). */
  background: rgba(var(--v-theme-primary), 0.03);
  border-top: 1px solid rgba(var(--v-theme-primary), 0.18);
}

.filters-top__cols {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
}

.filters-top__main {
  flex: 1 1 460px;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.filters-top__footer {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: auto;
  min-height: 60px;
  padding: 0 16px;
  box-sizing: border-box;
  border-top: 1px solid rgba(var(--v-theme-primary), 0.16);
  background: rgba(var(--v-theme-surface), 0.75);
}

.filters-top__pending {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), 0.7);
}

// Presets live in their own column on the left, set apart by a divider.
.filters-top__quick {
  // Grows with the panel on wide screens: 300px minimum, a fifth of the width, 480px at most.
  flex: 0 0 clamp(300px, 20%, 480px);
  max-width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 14px;
  min-width: 0;
  padding: 12px 16px 16px;
  border-right: 1px solid rgba(var(--v-theme-primary), 0.14);
}

@media (max-width: 860px) {
  .filters-top__quick {
    flex: 1 1 100%;
    border-right: 0;
    border-bottom: 1px solid rgba(var(--v-theme-primary), 0.14);
  }

  // Narrow: the presets block is the first thing under the floating menu / close buttons, so it stops short of them.
  .filters-top__shell--float .filters-top__quick {
    padding-right: 88px;
  }
}

// Open panel: the quick strip shares the top line with the menu and close buttons.
// Closed: label and active-filter chips share one line with the menu button.
// The label has a fixed width so the chips always start on a whole pixel (crisp edges).
.filters-top__chrome:not(.filters-top__chrome--panel) {
  align-items: flex-start;
  padding: 9px 12px 9px 16px;

  .filters-top__chrome-start {
    flex: 1 1 auto;
    height: auto;
    min-height: 30px;
    align-items: flex-start;
    gap: 0;
  }

  .filters-top__chrome-title {
    flex: 0 0 8.5rem;
    width: 8.5rem;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 30px;
  }

  .filters-top__chips {
    flex: 1 1 0;
    min-width: 0;
  }

  .filters-top__chips .filter-chip.v-chip {
    flex: 0 0 auto;
    height: 30px;
  }

  .filters-top__chrome-end {
    height: 30px;
  }
}

// Open panel without quick filters: the menu and close buttons float in the corner instead of taking a row.
.filters-top__shell--float {
  position: relative;

  .filters-top__chrome.filters-top__chrome--panel {
    position: absolute;
    top: 6px;
    right: 12px;
    z-index: 2;
    padding: 0;
  }

  .filters-top__chrome-start {
    display: none;
  }

  // Keep rows clear of the floating menu / close buttons in the corner.
  .filters-top__panel.filters-top__panel {
    padding-top: 10px;
  }

  // The heading line never runs under the menu / close buttons: it stops short and ends with an ellipsis.
  .filters-top__match {
    padding-right: 88px;
  }
}

.filters-top__chrome.filters-top__chrome--panel {
  align-items: flex-start;
  padding: 10px 12px 8px 16px;

  .filters-top__chrome-start,
  .filters-top__chrome-end {
    height: auto;
    min-height: 28px;
    align-items: flex-start;
  }

  .filters-top__chrome-start {
    flex: 1 1 auto;
  }

  .filters-top__chrome-end {
    gap: 4px;
    margin-top: 2px;
  }
}

.filters-top__quick:empty {
  display: none;
}

.filters-top__chrome {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: nowrap;
  padding: 12px 16px 10px;
  box-sizing: border-box;
}

.filters-top__chrome-start,
.filters-top__chrome-end {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  height: 32px;
}

.filters-top__chrome-end {
  gap: 4px;
  margin-left: auto;
  flex-shrink: 0;
}

.filters-top__chrome-title {
  font-size: 0.875rem;
  font-weight: 400;
  line-height: 1.2;
  white-space: nowrap;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.filters-top__chrome-btn {
  height: 32px !important;
  min-height: 32px !important;
  max-height: 32px !important;
  font-size: 0.75rem !important;
  text-transform: none;
  letter-spacing: normal;

  &--text {
    padding-inline: 6px !important;
  }
}



.filters-top__panel-slot {
  display: none;
}

.filters-top__panel-slot--open {
  display: block;
}

.filters-top__panel-slot-inner {
  overflow: hidden;
  min-height: 0;
}

.items-control-deck--browser .filters-top__panel {
  padding: 0 16px 16px;
  max-height: none;
}

.items-control-deck--browser .filters-top__panel .filters-panel {
  max-height: none;
  padding: 0 !important;
}

.filters-top__panel {
  max-height: min(42vh, 440px);
  overflow: hidden;

  .filters-panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
    max-height: min(42vh, 440px);
  }
}

.filters-top__chips {
  padding: 0 !important;
  margin: 0 !important;
  gap: 4px;
}

.filters-drawer {
  z-index: 1200;
  max-height: 100%;
  padding: 16px 4px 16px 16px;
  background: transparent !important;
  border: none !important;
  border-inline-end: none !important;
  box-shadow: none !important;
  pointer-events: none;

  .v-navigation-drawer__content {
    overflow: visible !important;
    background: transparent !important;
  }

  .filter-block {
    pointer-events: all;
    background-color: rgb(var(--v-theme-background)) !important;
    padding: 0;
    overflow: hidden;
    max-height: 100%;
    height: 100%;
    opacity: 0;
    transition: opacity 200ms ease;
    box-shadow: 0px 4px 6px -3px var(--v-shadow-key-umbra-opacity, rgba(0, 0, 0, 0.2)),
      -3px 9px 14px 1px var(--v-shadow-key-penumbra-opacity, rgba(0, 0, 0, 0.14)),
      5px 5px 18px 3px var(--v-shadow-key-ambient-opacity, rgba(0, 0, 0, 0.12));

    > .v-card__underlay {
      opacity: 0 !important;
    }
  }

  &.v-navigation-drawer--active .filter-block {
    opacity: 1;
  }

  &:not(.v-navigation-drawer--active) {
    overflow: hidden !important;

    .v-navigation-drawer__content {
      overflow: hidden !important;
    }
  }

  &.temporary {
    background: transparent !important;
    padding: 16px;
  }

  &.temporary.v-navigation-drawer--active {
    overflow: visible !important;
  }

  &:not(.temporary) {
    padding: 16px 0 16px 16px;
  }
}
.filters-top__match {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 0 8px 2px;
  // Same height with or without the all / any pill (30px) so the rows below never shift.
  min-height: 38px;
  min-width: 0;
  font-size: 0.875rem;

  > span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  > .filters-top__match-pill,
  > .v-menu {
    flex: 0 0 auto;
  }
}

// Small all / any menu: two short one-line options; the hints live on the pill's tooltip.
.filters-top__match-menu {
  .v-list {
    padding: 4px;
  }

  .v-overlay__content {
    min-width: 0 !important;
  }

  .v-list-item {
    min-height: 28px;
    padding-inline: 10px;
    border-radius: 8px;
  }

  .v-list-item-title {
    font-size: 0.8125rem;
  }
}

.filters-top__match-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 30px;
  padding: 0 8px 0 12px;
  border: 0;
  border-radius: 8px;
  font: inherit;
  font-weight: 500;
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.1);
  cursor: pointer;

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }
}

</style>
