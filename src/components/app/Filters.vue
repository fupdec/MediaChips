<template>
  <v-navigation-drawer
    v-model="filtersVisible"
    class="filters-drawer"
    :class="{'temporary': filtersFloating}"
    :temporary="filtersFloating"
    :floating="filtersFloating"
    :scrim="false"
    disable-resize-watcher
    width="450"
  >
    <v-card variant="tonal" color="primary" class="filter-block" rounded="xl">

      <v-overlay
        :model-value="!ITEMS.isFiltersLoaded"
        :opacity="0.1"
        contained
        persistent
        class="d-flex justify-center align-center"
      >
        <v-progress-circular indeterminate size="170" width="10" color="primary"/>
      </v-overlay>

      <v-card-actions class="pt-3 pb-6">
        <div class="d-flex align-center ga-3 min-width-0">
          <div class="d-flex align-center">
            <v-icon start>mdi-filter</v-icon>
            <span class="text-h5">{{ t('filters.title') }}</span>
          </div>

          <v-switch
            v-if="filters.length >= 1"
            v-model="editMode"
            color="primary"
            density="compact"
            hide-details
            inset
            class="flex-grow-0 ma-0 filters-edit-switch"
            :aria-label="t('filters.edit_mode')"
            :title="t('filters.edit_mode_hint')"
          >
            <template #thumb>
              <v-icon v-if="editMode" size="x-small">mdi-pencil</v-icon>
            </template>
          </v-switch>
        </div>

        <v-spacer></v-spacer>

        <v-btn @click="filtersStore.visible = false" variant="text" icon size="small">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-actions>

      <div class="px-2">
        <div class="d-flex align-center mb-2 ga-2" :class="editMode ? 'justify-space-between' : ''">
          <v-btn
            v-if="editMode"
            variant="tonal"
            rounded="xl"
            size="small"
            color="primary"
            @click="dialogSaved = true"
          >
            <v-icon start size="small">mdi-content-save</v-icon>
            {{ t('filters.saved_short') }}
          </v-btn>

          <v-btn
            @click="apply"
            :color="is_filters_changed ? 'success' : 'primary'"
            rounded="xl"
            variant="flat"
            :block="!editMode"
            :class="{ 'flex-grow-1': !editMode }"
          >
            <v-icon start size="small">mdi-check</v-icon>
            {{ t('common.apply') }}
          </v-btn>
        </div>

        <FiltersAdd
          v-if="isReady && (editMode || filters.length === 0)"
          @add="add"
          :params="listBy"
          class="my-2"
        />
      </div>

      <v-card-text v-if="isReady" class="filters-list">
        <Draggable
          v-if="filters.length > 0 && editMode"
          v-model="filters"
          v-bind="dragOptions"
          :item-key="dragItemKey"
          handle=".drag-handle"
          @end="onReorder"
          class="filters-draggable"
        >
          <template #item="{ element: f, index: i }">
            <FilterRow
              :filter="f"
              :index="i"
              :list-by="listBy"
              editable
              @set-by="setBy($event, i)"
              @set-condition="setCondition($event, i)"
              @set-value="setValue($event, i)"
              @set-active="setActive($event, i)"
              @remove="remove(i)"
              @pick-date="pickDate(i)"
              @valid="validate"
            />
          </template>
        </Draggable>

        <template v-else-if="filters.length > 0">
          <FilterRow
            v-for="(f, i) in filters"
            :key="String(f.id ?? f.clientKey ?? i)"
            :filter="f"
            :index="i"
            :list-by="listBy"
            @set-by="setBy($event, i)"
            @set-condition="setCondition($event, i)"
            @set-value="setValue($event, i)"
            @set-active="setActive($event, i)"
            @remove="remove(i)"
            @pick-date="pickDate(i)"
            @valid="validate"
            ref="filterRows"
          />
        </template>

        <div v-else class="text-center py-6 overline">
          <v-img src="/images/filters/filters-none.svg" class="my-4" contain/>
          <div>{{ t('filters.no_filters') }}</div>
        </div>
      </v-card-text>
    </v-card>

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
    <v-dialog v-model="datePicker.dialog" width="auto">
      <v-date-picker
        @update:model-value="setDate"
        :model-value="datePicker.value"
        :title="t('filters.select_date')"
        color="primary"
        rounded="xl"
      />
    </v-dialog>
  </v-navigation-drawer>
</template>

<script setup lang="ts">
import {ref, computed, watch, onMounted, onUnmounted, defineAsyncComponent} from 'vue'
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
import {useEventBus} from '@/utils/eventBus'
import type { FilterObject, FilterListParam } from '@/types/common'
import type { SavedFilter } from '@/types/stores'
import {
  getCurrentMediaType,
  isImageMediaType,
  isVideoMediaType,
  isAudioMediaType,
} from '@/utils/mediaType'
import {
  sanitizeFiltersForMediaType,
} from '@/utils/mediaSortFilter'
import {registerItemsFiltersController} from '@/composable/itemsFiltersController'

import cols from '../../../app/configs/filter-cols'

// Components
import FilterRow from '@/components/app/FilterRow.vue'
import DialogFiltersSaved from '@/components/dialogs/filters/DialogFiltersSaved.vue'
import FiltersAdd from '@/components/dialogs/filters/FiltersAdd.vue'

const Draggable = defineAsyncComponent(() => import('vuedraggable'))

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
const eventBus = useEventBus()
const {t} = useI18n()
const {width} = useDisplay()

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
const filterRows = ref<Array<InstanceType<typeof FilterRow>> | null>(null)
const filtersPreviousState = ref<FilterObject[]>([])
const editMode = ref(false)

const dragOptions = {
  animation: 200,
  ghostClass: 'filter-ghost',
}

const dragItemKey = (filter: FilterObject) => String(filter.id ?? filter.clientKey)

// Computed
const filtersVisible = computed({
  get: () => filtersStore.visible,
  set: (value: boolean) => {
    filtersStore.visible = value
  },
})

const ITEMS = computed(() => itemsStore)
const ENV = computed(() => ITEMS.value.environment)

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
  eventBus.emit('setItemsFilters', {filters: filters.value})
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
const handleApplySavedFilter = (filtersPayload: unknown) => {
  loadSavedFilter(filtersPayload as FilterObject[])
  void apply()
}

const handleDeactivateFilter = (index: number) => {
  filters.value[index].active = false
  void apply()
}

const handleDeactivateAllFilters = () => {
  deactivateAll()
  void apply()
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
  if (!visible) editMode.value = false
})
</script>

<style lang="scss">
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
    padding: 8px 8px 16px;
    display: grid;
    grid-template-rows: auto auto 1fr;
    overflow: hidden;
    max-height: 100%;
    height: 100%;
    opacity: 0;
    transition: opacity 200ms ease;
    box-shadow: 0px 4px 6px -3px var(--v-shadow-key-umbra-opacity, rgba(0, 0, 0, 0.2)),
      -3px 9px 14px 1px var(--v-shadow-key-penumbra-opacity, rgba(0, 0, 0, 0.14)),
      5px 5px 18px 3px var(--v-shadow-key-ambient-opacity, rgba(0, 0, 0, 0.12));

    // tonal underlay would paint a primary tint over the solid background
    > .v-card__underlay {
      opacity: 0 !important;
    }
  }

  &.v-navigation-drawer--active .filter-block {
    opacity: 1;
  }

  // Clip leftovers when fully closed, but keep content visible during fade/slide.
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

  // Docked: no gutter strip beside the card
  &:not(.temporary) {
    padding: 16px 0 16px 16px;
  }
}

.filters-list {
  overflow-y: auto;
  min-height: 0;
  padding: 4px 12px 0 8px;
  scrollbar-gutter: stable;
  display: flex;
  flex-direction: column;
  gap: 8px;

  .filters-draggable {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .filter-ghost {
    opacity: 0.5;
  }

  .filter-form .filter {
    margin-bottom: 0 !important;
  }
}

.filters-edit-switch {
  transform: scale(0.82);
  transform-origin: left center;

  :deep(.v-selection-control) {
    min-height: 28px;
  }

  :deep(.v-switch__thumb) {
    display: flex;
    align-items: center;
    justify-content: center;
  }
}
</style>