<template>
  <!-- Inline mode: a search field with a wide, grouped, multi-column field picker instead of one long list. -->
  <div
    v-if="autoOpen"
    class="filters-picker"
  >
    <v-text-field
      ref="pickerInput"
      v-model="search"
      density="compact"
      variant="outlined"
      color="primary"
      rounded="lg"
      hide-details
      clearable
      autofocus
      prepend-inner-icon="mdi-magnify"
      class="filters-picker__search"
      :placeholder="t('common.search')"
      :aria-label="t('filters.add_new_filter')"
      @keydown.enter.prevent="pickFirst"
      @keydown.esc="emit('close')"
    />

    <v-menu
      v-model="menuOpen"
      activator="parent"
      location="bottom start"
      :open-on-click="false"
      :close-on-content-click="false"
      :transition="false"
      content-class="filters-picker-menu"
    >
      <div class="filters-picker__panel">
        <section
          v-if="visiblePresets.length"
          class="filters-picker__section"
        >
          <div class="filters-picker__title">
            {{ t('filters.presets_title') }}
          </div>
          <div class="filters-picker__grid">
            <button
              v-for="preset in visiblePresets"
              :key="preset.id"
              type="button"
              class="filters-picker__item filters-picker__item--preset"
              :title="preset.fields.map((field) => getFilterText(field)).join(', ')"
              @click="pickPreset(preset)"
            >
              <v-icon size="16">mdi-{{ preset.icon }}</v-icon>
              <span class="filters-picker__label">{{ preset.label }}</span>
              <span class="filters-picker__count">{{ preset.fields.length }}</span>
            </button>
          </div>
        </section>

        <section
          v-for="section in pickerSections"
          :key="section.group"
          class="filters-picker__section"
        >
          <div class="filters-picker__title">
            {{ getGroupText(section.group) }}
          </div>
          <div class="filters-picker__grid">
            <button
              v-for="item in section.items"
              :key="String(item.param)"
              type="button"
              class="filters-picker__item"
              :title="getTypeText(item.type)"
              @click="pickItem(item)"
            >
              <v-icon size="16">mdi-{{ item.icon }}</v-icon>
              <span
                class="filters-picker__label"
                v-html="highlight(getFilterText(item))"
              ></span>
            </button>
          </div>
        </section>
        <div
          v-if="!pickerSections.length && !visiblePresets.length"
          class="filters-picker__empty"
        >
          {{ t('common.no_results') }}
        </div>
      </div>
    </v-menu>
  </div>

  <v-autocomplete
    v-else
    ref="filtersRef"
    v-model="selectedFilter"
    v-model:search="search"
    v-model:menu="menuOpen"
    :autofocus="autoOpen"
    :items="filtersGrouped"
    :disabled="disabled"
    hide-details
    :label="hideFloatingLabel ? undefined : t('filters.add_new_filter')"
    :placeholder="hideFloatingLabel ? t('common.search') : undefined"
    :aria-label="t('filters.add_new_filter')"
    density="compact"
    variant="outlined"
    color="primary"
    :rounded="hideFloatingLabel ? 'xl' : true"
    return-object
    :single-line="hideFloatingLabel"
    :class="{'filters-add--compact': hideFloatingLabel}"
    :custom-filter="acceptFilterItem"
    :menu-props="{ contentClass: 'custom-list filters-add-menu', maxHeight: 380 }"
    @click:append="add"
    @keyup.enter="add"
  >
    <!-- APPEND -->
    <template v-if="selectedFilter" #append>
      <v-btn
        @click="add"
        color="success"
        rounded="xl"
        variant="flat"
        :size="hideFloatingLabel ? 'x-small' : 'small'"
        :icon="hideFloatingLabel"
        :aria-label="t('common.add')"
        :title="t('common.add')"
      >
        <v-icon
          :start="!hideFloatingLabel"
          :size="hideFloatingLabel ? 16 : 18"
        >
          mdi-plus
        </v-icon>
        <template v-if="!hideFloatingLabel">
          {{ t('common.add') }}
        </template>
      </v-btn>
    </template>

    <!-- SELECTED -->
    <template #selection="{ item }">
      <div
        class="filters-add__selection"
        :class="{'filters-add__selection--compact': hideFloatingLabel}"
      >
        <v-icon :size="hideFloatingLabel ? 14 : 16">
          mdi-{{ getFilterParam(item.raw).icon }}
        </v-icon>
        <span class="filters-add__selection-label">
          {{ getFilterText(getFilterParam(item.raw)) }}
        </span>
      </div>
    </template>

    <!-- ITEM -->
    <template #item="{ item, props }">
      <div
        v-if="isGroupHeader(item.raw)"
        class="filters-add-menu__category"
      >
        {{ getGroupText(item.raw.header) }}
      </div>

      <v-list-item
        v-else
        v-bind="props"
        class="filters-add-item"
      >
        <template #prepend>
          <v-icon size="18">
            mdi-{{ getFilterParam(item.raw).icon }}
          </v-icon>
        </template>

        <template #title>
          <div
            v-html="highlight(getFilterText(getFilterParam(item.raw)))"
            class="filters-add-item__title"
          ></div>
        </template>

        <template #append>
          <v-icon
            size="14"
            class="filters-add-item__type"
            :title="getTypeText(getFilterParam(item.raw).type)"
          >
            {{ getTypeIcon(getFilterParam(item.raw).type) }}
          </v-icon>
        </template>
      </v-list-item>
    </template>
  </v-autocomplete>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import type { PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import orderBy from 'lodash/orderBy'
import groupBy from 'lodash/groupBy'
import { foundByChars, highlightChars } from '@/services/formatUtils'
import { getIconDataType } from '@/services/metaTypeUtils'
import {useSettingsStore} from '@/stores/settings'
import type { FilterListParam } from '@/types/common'

interface FilterGroupHeader {
  header: string
  count: number
  disabled: true
}

type FilterGroupedItem = FilterListParam | FilterGroupHeader

const settingsStore = useSettingsStore()
const {t} = useI18n()

const props = defineProps({
  params: {
    type: Array as PropType<FilterListParam[]>,
    required: true,
  },
  disabled: Boolean,
  hideFloatingLabel: Boolean,
  /** Inline mode: opens the list on mount, adds the picked filter at once and asks to close when dismissed. */
  autoOpen: Boolean,
})

const emit = defineEmits(['add', 'close'])

/* =========================
 * STATE
 * ========================= */

const selectedFilter = ref<FilterListParam | FilterGroupHeader | null>(null)
const search = ref('')
const menuOpen = ref(false)
const filtersRef = ref<{ blur?: () => void } | null>(null)
const pickerInput = ref<{ focus?: () => void } | null>(null)

const isDefaultSearch = computed(() => settingsStore.typingFiltersDefault == '1')

const getFilterText = (item: FilterListParam) =>
  item?.textKey ? t(item.textKey) : item?.text || ''

const getGroupText = (group?: string) =>
  t(`filters.groups.${group}`, group || '')

const isGroupHeader = (item: unknown): item is FilterGroupHeader =>
  typeof item === 'object' && item !== null && 'header' in item

const matchesSearch = (text: string, query: string) => {
  if (!query) return true
  return isDefaultSearch.value
    ? text.toLowerCase().includes(query.toLowerCase())
    : foundByChars(text, query)
}

const acceptFilterItem = (
  _title: string,
  query: string,
  item?: { raw: FilterGroupedItem },
) => {
  const raw = item?.raw
  if (!raw || isGroupHeader(raw)) return true
  return matchesSearch(getFilterText(raw), query)
}

/* =========================
 * COMPUTED
 * ========================= */

const filtersGrouped = computed((): FilterGroupedItem[] => {
  const params = props.params.filter((i: FilterListParam) => matchesSearch(getFilterText(i), search.value))
  const ordered = orderBy(params, [(i: FilterListParam) => getGroupText(i.group), (i: FilterListParam) => getFilterText(i)])
  const grouped = groupBy(ordered, 'group')

  const result: FilterGroupedItem[] = []

  for (const group in grouped) {
    result.push({
      header: group,
      count: grouped[group].length,
      disabled: true,
    })
    result.push(...grouped[group])
  }
  return result
})

/** Groups with their fields, for the inline picker. */
const pickerSections = computed(() => {
  const sections: Array<{group: string, items: FilterListParam[]}> = []
  for (const entry of filtersGrouped.value) {
    if (isGroupHeader(entry)) sections.push({group: entry.header, items: []})
    else sections[sections.length - 1]?.items.push(entry)
  }
  return sections.filter((section) => section.items.length)
})

/** Ready-made sets: one click adds several related conditions at once. */
interface FilterPreset {
  id: string
  icon: string
  label: string
  fields: Array<FilterListParam & {cond?: string}>
}

const PRESET_DEFS: Array<{id: string, icon: string, params?: Array<string | [string, string]>, pinned?: boolean}> = [
  {id: 'file', icon: 'file-search', params: ['name', 'path', 'ext', 'filesize']},
  {id: 'folder', icon: 'folder-search-outline', params: [['path', 'under folder']]},
  {id: 'source', icon: 'server-network', params: ['source', 'availability']},
  {id: 'tags', icon: 'tag-multiple-outline', pinned: true},
  {id: 'quality', icon: 'high-definition', params: ['width', 'height', 'bitrate', 'fps', 'codec']},
  {id: 'watch', icon: 'eye-outline', params: ['views', 'viewedAt', 'rating', 'favorite']},
  {id: 'dates', icon: 'calendar-range', params: ['createdAt', 'mediaCreatedAt', 'updatedAt']},
]

const presets = computed((): FilterPreset[] => {
  const result: FilterPreset[] = []
  for (const def of PRESET_DEFS) {
    const fields: FilterPreset['fields'] = []
    if (def.pinned) {
      fields.push(...props.params.filter((param) => param.group === 'Pinned meta'))
    } else {
      for (const entry of def.params || []) {
        const [name, cond] = Array.isArray(entry) ? entry : [entry, undefined]
        const found = props.params.find((param) => String(param.param) === name)
        if (found) fields.push(cond ? {...found, cond} : found)
      }
    }
    if (fields.length) result.push({id: def.id, icon: def.icon, label: t(`filters.preset_${def.id}`), fields})
  }
  return result
})

const visiblePresets = computed(() =>
  presets.value.filter((preset) => matchesSearch(preset.label, search.value)),
)

const pickPreset = (preset: FilterPreset) => {
  emit('add', preset.fields)
  search.value = ''
  menuOpen.value = false
}

const pickItem = (item: FilterListParam) => {
  emit('add', [item])
  search.value = ''
  menuOpen.value = false
}

const pickFirst = () => {
  const first = pickerSections.value[0]?.items[0]
  if (first) pickItem(first)
}

watch(selectedFilter, (value) => {
  if (value && isGroupHeader(value)) {
    selectedFilter.value = null
    return
  }
  if (value && props.autoOpen) add()
})

watch(menuOpen, (open) => {
  if (open) search.value = ''
  else if (props.autoOpen) emit('close')
})

onMounted(() => {
  if (props.autoOpen) {
    nextTick(() => {
      menuOpen.value = true
      nextTick(() => pickerInput.value?.focus?.())
    })
  }
})

/* =========================
 * METHODS
 * ========================= */

const getFilterParam = (item: unknown): FilterListParam => item as FilterListParam

const add = () => {
  if (!selectedFilter.value || isGroupHeader(selectedFilter.value)) return

  emit('add', [selectedFilter.value])
  selectedFilter.value = null
  search.value = ''
  filtersRef.value?.blur?.()
}

const getTypeIcon = (type?: string) => getIconDataType(type || '')

const highlight = (text: string) =>
  highlightChars(text, search.value, isDefaultSearch.value)

const getTypeText = (type?: string) =>
  t(`meta.types.${type}`, type || '')
</script>

<style scoped lang="scss">
.filters-add__selection {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.filters-add__selection-label {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.filters-add__selection--compact {
  gap: 4px;

  .filters-add__selection-label {
    font-size: 0.75rem;
    line-height: 1.2;
  }
}

// Inline picker search: exactly the height of the neighbouring "Add filter" button (32px), so swapping them never moves the row.
.filters-picker__search {
  :deep(.v-field) {
    --v-input-control-height: 32px;
    min-height: 32px !important;
    height: 32px !important;
    font-size: 0.8125rem;
  }

  :deep(.v-field__field) {
    height: 32px;
  }

  :deep(.v-field__input) {
    min-height: 32px !important;
    max-height: 32px !important;
    height: 32px !important;
    padding-top: 0 !important;
    padding-bottom: 0 !important;
    align-items: center;
    font-size: 0.8125rem !important;
  }

  :deep(.v-field__prepend-inner),
  :deep(.v-field__clearable) {
    align-items: center;
    padding-top: 0;
  }
}

.filters-add--compact {
  :deep(.v-field) {
    --v-input-control-height: 32px;
    min-height: 32px !important;
    height: 32px !important;
  }

  :deep(.v-field__field) {
    height: 32px;
  }

  :deep(.v-field__input) {
    min-height: 32px !important;
    max-height: 32px !important;
    height: 32px !important;
    flex-wrap: nowrap !important;
    overflow: hidden;
    padding-top: 0 !important;
    padding-bottom: 0 !important;
    padding-inline: 10px 8px !important;
    align-items: center;
    font-size: 0.875rem !important;
    line-height: 1.2 !important;
  }

  :deep(.v-autocomplete__selection) {
    display: flex;
    align-items: center;
    min-width: 0;
    max-width: 100%;
    margin-inline-end: 0;
    overflow: hidden;
    white-space: nowrap;
  }

  :deep(.v-field__input input) {
    min-width: 0 !important;
    max-width: 100%;
  }

  :deep(.v-field__append-inner) {
    padding-top: 0;
    align-self: center;
  }

  :deep(.v-input__append .v-btn) {
    width: 32px !important;
    height: 32px !important;
    min-width: 32px !important;
    min-height: 32px !important;
  }
}
</style>

<style lang="scss">
// The picker menu is teleported out of the component, so it is styled globally.
.filters-picker-menu {
  width: min(720px, 92vw);
  border: 1px solid rgba(var(--v-theme-primary), 0.14);
  border-radius: 12px;
  background: rgb(var(--v-theme-surface));
  box-shadow: 0 12px 32px -10px rgba(0, 0, 0, 0.3), 0 2px 6px rgba(0, 0, 0, 0.08) !important;
  overflow: hidden;
}

.filters-picker__panel {
  max-height: min(56vh, 420px);
  overflow-y: auto;
  padding: 6px 10px 10px;
}

.filters-picker__title {
  padding: 10px 6px 4px;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.55);
}

.filters-picker__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 2px;
}

.filters-picker__item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  height: 32px;
  padding: 0 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: rgb(var(--v-theme-on-surface));
  font: inherit;
  font-size: 0.8125rem;
  text-align: start;
  cursor: pointer;

  .v-icon {
    flex: 0 0 auto;
    color: rgba(var(--v-theme-primary), 0.85);
  }

  &:hover,
  &:focus-visible {
    outline: 0;
    background: rgba(var(--v-theme-primary), 0.09);
    color: rgb(var(--v-theme-primary));
  }
}

.filters-picker__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.filters-picker__item--preset {
  background: rgba(var(--v-theme-primary), 0.06);
}

.filters-picker__count {
  margin-inline-start: auto;
  padding: 0 6px;
  border-radius: 8px;
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
  font-size: 0.6875rem;
  line-height: 16px;
}

.filters-picker__empty {
  padding: 18px 6px;
  text-align: center;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
</style>
