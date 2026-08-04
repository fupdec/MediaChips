<template>
  <v-autocomplete
    ref="filtersRef"
    v-model="selectedFilter"
    v-model:search="search"
    :items="filtersGrouped"
    :disabled="disabled"
    hide-details
    :label="hideFloatingLabel ? undefined : t('filters.add_new_filter')"
    :placeholder="hideFloatingLabel ? t('filters.add_new_filter') : undefined"
    :aria-label="t('filters.add_new_filter')"
    density="compact"
    variant="outlined"
    color="primary"
    :rounded="hideFloatingLabel ? 'xl' : true"
    return-object
    :single-line="hideFloatingLabel"
    :class="{'filters-add--compact': hideFloatingLabel}"
    :custom-filter="acceptFilterItem"
    :menu-props="{ contentClass: 'custom-list filters-add-menu' }"
    @click:append="add"
    @keyup.enter="add"
    @update:menu="onMenuToggle"
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
        <v-icon
          size="16"
          class="filters-add-menu__category-icon"
        >
          mdi-{{ getGroupIcon(item.raw.header) }}
        </v-icon>
        <span class="filters-add-menu__category-title">
          {{ getGroupText(item.raw.header) }}
        </span>
        <v-chip
          size="x-small"
          variant="tonal"
          color="primary"
          class="ml-2"
        >
          {{ item.raw.count }}
        </v-chip>
      </div>

      <v-list-item
        v-else
        v-bind="props"
        class="filters-add-item"
      >
        <template #prepend>
          <v-icon size="22">
            mdi-{{ getFilterParam(item.raw).icon }}
          </v-icon>
        </template>

        <template #title>
          <div
            v-html="highlight(getFilterText(getFilterParam(item.raw)))"
            class="filters-add-item__title"
          ></div>
        </template>

        <template #subtitle>
          <div class="d-flex align-center filters-add-item__subtitle">
            <v-icon size="12" class="mr-1">
              {{ getTypeIcon(getFilterParam(item.raw).type) }}
            </v-icon>
            {{ getTypeText(getFilterParam(item.raw).type) }}
          </div>
        </template>
      </v-list-item>
    </template>
  </v-autocomplete>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
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

const GROUP_ICONS: Record<string, string> = {
  File: 'file-outline',
  Video: 'video-outline',
  Image: 'image-outline',
  Audio: 'music-note-outline',
  Tag: 'tag-multiple-outline',
  'Preset meta': 'form-textbox',
  'Pinned meta': 'pin-outline',
  Other: 'dots-horizontal',
}

const settingsStore = useSettingsStore()
const {t} = useI18n()

const props = defineProps({
  params: {
    type: Array as PropType<FilterListParam[]>,
    required: true,
  },
  disabled: Boolean,
  hideFloatingLabel: Boolean,
})

const emit = defineEmits(['add'])

/* =========================
 * STATE
 * ========================= */

const selectedFilter = ref<FilterListParam | FilterGroupHeader | null>(null)
const search = ref('')
const filtersRef = ref<{ blur?: () => void } | null>(null)

const isDefaultSearch = computed(() => settingsStore.typingFiltersDefault == '1')

const getFilterText = (item: FilterListParam) =>
  item?.textKey ? t(item.textKey) : item?.text || ''

const getGroupText = (group?: string) =>
  t(`filters.groups.${group}`, group || '')

const getGroupIcon = (group?: string) =>
  GROUP_ICONS[group || ''] || 'filter-outline'

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

watch(selectedFilter, (value) => {
  if (value && isGroupHeader(value)) {
    selectedFilter.value = null
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

const onMenuToggle = (open: boolean) => {
  if (open) search.value = ''
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

.filters-add--compact {
  :deep(.v-field) {
    --v-input-control-height: 28px;
    min-height: 28px !important;
    height: 28px !important;
  }

  :deep(.v-field__field) {
    height: 28px;
  }

  :deep(.v-field__input) {
    min-height: 28px !important;
    max-height: 28px !important;
    height: 28px !important;
    flex-wrap: nowrap !important;
    overflow: hidden;
    padding-top: 0 !important;
    padding-bottom: 0 !important;
    padding-inline: 10px 8px !important;
    align-items: center;
    font-size: 0.75rem !important;
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
    width: 28px !important;
    height: 28px !important;
    min-width: 28px !important;
    min-height: 28px !important;
  }
}
</style>
