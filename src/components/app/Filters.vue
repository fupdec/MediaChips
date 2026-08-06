<template>
  <Teleport
    to="#items-filters-top-host"
    :disabled="!useTopPanel"
  >
    <div
      v-if="useTopPanel"
      class="filters-top"
    >
      <div
        v-if="showTopShell"
        class="filters-top__shell"
        :class="{
          'filters-top__shell--panel': isPanelView,
          'filters-top__shell--full': filtersViewMode === 'full',
          'filters-top__shell--simple': !isPanelView,
        }"
      >
        <div class="filters-top__chrome">
          <div class="filters-top__chrome-start">
            <v-icon size="18">mdi-filter</v-icon>
            <span class="filters-top__chrome-title">{{ t('filters.title') }}</span>

            <v-btn-toggle
              :model-value="filtersViewMode"
              class="filters-top__mode"
              color="primary"
              density="compact"
              variant="outlined"
              divided
              mandatory
              @update:model-value="setFiltersViewMode"
            >
              <v-btn
                value="simple"
                size="small"
                :disabled="!showTopChips && isPanelView"
              >
                {{ t('filters.simple') }}
              </v-btn>
              <v-btn
                value="advanced"
                size="small"
              >
                {{ t('filters.advanced') }}
              </v-btn>
              <v-btn
                value="full"
                size="small"
                v-tooltip:top="t('filters.edit_mode_hint')"
              >
                {{ t('filters.full') }}
              </v-btn>
            </v-btn-toggle>
          </div>

          <div class="filters-top__chrome-end">
            <v-btn
              v-if="isPanelView"
              :color="is_filters_changed ? 'success' : 'primary'"
              rounded="xl"
              variant="flat"
              size="small"
              @click="apply"
            >
              <v-icon
                start
                size="small"
              >
                mdi-check
              </v-icon>
              {{ t('common.apply') }}
            </v-btn>

            <v-btn
              v-if="showTopChips"
              variant="text"
              size="small"
              color="primary"
              @click="handleDeactivateAllFilters"
            >
              {{ t('filters.deactivate_all_filters') }}
            </v-btn>

            <v-btn
              v-if="isPanelView"
              variant="text"
              icon
              size="small"
              :aria-label="t('appbar.buttons.hide_filters')"
              @click="closeTopFilters"
            >
              <v-icon>mdi-close</v-icon>
            </v-btn>
          </div>
        </div>

        <div
          v-if="!isPanelView"
          class="filters-top__brief"
        >
          <FiltersChips
            :filters="ITEMS.filters"
            class="filters-top__chips"
          />
        </div>

        <v-expand-transition>
          <div
            v-if="isPanelView"
            class="filters-top__panel"
          >
            <FiltersPanel
              variant="top"
              hide-header
              v-bind="panelBindings"
              @update:edit-mode="editMode = $event"
              @update:filters="filters = $event"
              @close="closeTopFilters"
              @apply="apply"
              @add="add"
              @reorder="onReorder"
              @open-saved="dialogSaved = true"
              @set-by="setBy"
              @set-condition="setCondition"
              @set-value="setValue"
              @set-active="setActive"
              @remove="remove"
              @pick-date="pickDate"
              @valid="validate"
            />
          </div>
        </v-expand-transition>
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
          @update:edit-mode="editMode = $event"
          @update:filters="filters = $event"
          @close="filtersStore.visible = false"
          @apply="apply"
          @add="add"
          @reorder="onReorder"
          @open-saved="dialogSaved = true"
          @set-by="setBy"
          @set-condition="setCondition"
          @set-value="setValue"
          @set-active="setActive"
          @remove="remove"
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
    :can-create="hasSavableFilters"
    @close="dialogSaved = false"
    @apply="loadSavedFilter"
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
      color="primary"
      rounded="xl"
      @update:model-value="setDate"
    />
  </v-dialog>
</template>

<script setup lang="ts">
import {ref, computed, watch, onMounted, onUnmounted} from 'vue'
import {useI18n} from 'vue-i18n'
import {useDisplay} from 'vuetify'
import dayjs from 'dayjs'
import {cloneFilters, filtersEqual} from '@/utils/filterClone'
import {typedApi} from '@/services/typedApi'
import {getSavedFilters} from '@/services/filterService'
import {
  getFilterObject,
  getListCond,
} from '@/services/formatUtils'
import {useAppStore} from '@/stores/app'
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
import {useItemsPageCommands} from '@/composable/itemsPageCommands'
import {useBrowserLayout} from '@/composable/useBrowserLayout'
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
const props = defineProps({
  isReady: Boolean
})

// Stores
const appStore = useAppStore()
const filtersStore = appStore.filters
const itemsStore = useItemsStore()
const pageCommands = useItemsPageCommands()
const {t} = useI18n()
const {width} = useDisplay()
const {useItemsControlDeck: controlDeckActive} = useBrowserLayout()

const useTopPanel = computed(() => controlDeckActive.value)

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
      'Suggest concrete next filter steps using only available fields.',
      'Return JSON with summary, suggestions (string array), explanation.',
    ].join(' ')
  }
  return [
    `Help me design useful MediaChips filters for this ${kind} library page.`,
    'Suggest concrete filter steps using only available fields.',
    'Return JSON with summary, suggestions (string array), explanation.',
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
const editMode = ref(false)

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
  return hasActive || hasDuplicates
})

const showTopShell = computed(() => filtersVisible.value || showTopChips.value)

type TopFiltersMode = 'simple' | 'advanced' | 'full'
const topFiltersMode = ref<TopFiltersMode>('simple')

const isPanelView = computed(() =>
  topFiltersMode.value === 'advanced' || topFiltersMode.value === 'full',
)
const filtersViewMode = computed(() => topFiltersMode.value)

const setFiltersViewMode = (mode: unknown) => {
  if (mode !== 'simple' && mode !== 'advanced' && mode !== 'full') return
  topFiltersMode.value = mode
  if (mode === 'simple') {
    filtersStore.visible = false
    editMode.value = false
    return
  }
  filtersStore.visible = true
  editMode.value = mode === 'full'
}

const panelBindings = computed(() => ({
  editMode: editMode.value,
  filters: filters.value,
  listBy: listBy.value,
  isReady: props.isReady,
  isFiltersChanged: is_filters_changed.value,
  filterAiPrompt: filterAiPrompt.value,
  filterAiContext: filterAiContext.value as Record<string, unknown>,
  dragOptions,
}))

const currentMediaType = computed(() =>
  getCurrentMediaType(appStore.mediaTypes, ENV.value.media_type_id)
)

const is_filters_changed = computed(() =>
  !filtersEqual(filtersPreviousState.value, filters.value),
)

const hasSavableFilters = computed(() =>
  filters.value.some((filter) => !filter.removed && !filter.lock),
)

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
  filtersPreviousState.value = cloneFilters(filters.value)
}

const add = (params: FilterListParam[]) => {
  for (const i of params) {
    const conditions = getListCond(i.type ?? null)
    const cond = conditions?.[0]?.cond ?? null
    const filter_obj = getFilterObject({
      param: String(i.param),
      type: i.type ?? null,
      cond,
      order: filters.value.length,
    })
    filters.value.push(filter_obj)
  }
  editMode.value = true
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

const setActive = (value: boolean, index: number) => {
  filters.value[index].active = value
}

const remove = (index: number) => {
  filters.value[index].removed = !filters.value[index].removed
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
  await addFilterRows(savedFilter?.id)

  const removed_filters = filters.value.filter(i => i.removed)
  for (const f of removed_filters) {
    if (f.id) {
      await typedApi.deleteFilterRow(f.id)
    }
  }

  itemsStore.updateState({key: "filters", value: cloneFilters(filters.value)})
  void pageCommands.setFilters({filters: filters.value})
}

const addFilterRows = async (filterId: number | null | undefined, isSavedFilter = false) => {
  for (let index = 0; index < filters.value.length; index++) {
    const filter = filters.value[index]
    if (filter.lock || filter.removed) continue

    const payload = cloneFilters([{...filter, order: index}])[0]
    if (isSavedFilter) payload.id = null

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
  }
}

const saveCurrentAsNamed = async (name: string) => {
  const trimmed = String(name || '').trim()
  if (!trimmed || !hasSavableFilters.value) return

  let savedFilter: SavedFilter = { id: 0 }

  try {
    const response = await typedApi.createSavedFilter({
      name: trimmed,
      mediaTypeId: ENV.value.media_type_id ?? null,
      metaId: ENV.value.meta_id ?? null,
      tagId: ENV.value.tag_id ?? null,
      tabId: ENV.value.tab_id ?? null,
    })
    const data = response.data
    savedFilter = Array.isArray(data) ? data[0] : data
  } catch (error) {
    console.error('Error saving filter:', error)
    return
  }

  if (savedFilter?.id) {
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

watch(() => filters.value.length, (length) => {
  if (length < 1) editMode.value = false
})

watch(filtersVisible, (visible) => {
  if (!visible) {
    editMode.value = false
    if (topFiltersMode.value !== 'simple') {
      topFiltersMode.value = 'simple'
    }
    return
  }
  if (topFiltersMode.value === 'simple') {
    topFiltersMode.value = 'advanced'
    editMode.value = false
  }
})
</script>

<style lang="scss">
.filters-top {
  width: 100%;
  margin-bottom: 0;
}

.filters-top__shell {
  width: 100%;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
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
  background: transparent;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.filters-top__chrome {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 14px;
  min-height: 44px;
}

.filters-top__chrome-start,
.filters-top__chrome-end {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.filters-top__chrome-end {
  margin-left: auto;
  flex-shrink: 0;
}

.filters-top__chrome-title {
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 1;
}

.filters-top__mode {
  align-self: center;
  height: 28px !important;
  min-height: 28px !important;

  .v-btn {
    height: 28px !important;
    min-height: 28px !important;
    min-width: 0;
    padding-inline: 10px;
    font-size: 0.75rem;
    text-transform: none;
    letter-spacing: normal;
  }
}

.filters-top__brief {
  padding: 2px 10px 10px;
}

.items-control-deck--browser .filters-top__panel {
  padding: 0 14px 8px;
  max-height: none;
}

.items-control-deck--browser .filters-top__panel .filters-panel {
  max-height: none;
  padding: 0 !important;
}

.filters-top__panel {
  max-height: min(42vh, 440px);
  overflow: hidden;
  display: flex;
  flex-direction: column;

  .filters-panel {
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
</style>
