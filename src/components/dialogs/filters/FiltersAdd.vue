<template>
  <v-autocomplete
    ref="filtersRef"
    v-model="selectedFilter"
    v-model:search="search"
    :items="filtersGrouped"
    :disabled="disabled"
    hide-details
    :label="t('filters.add_new_filter')"
    density="compact"
    variant="outlined"
    color="primary"
    rounded
    return-object
    :custom-filter="acceptFilterItem"
    :menu-props="{ contentClass: 'custom-list filters-add-menu' }"
    @click:append="add"
    @keyup.enter="add"
  >
    <!-- APPEND -->
    <template v-if="selectedFilter" #append>
      <v-btn @click="add" color="primary" rounded="xl" variant="flat">
        <v-icon start>mdi-plus</v-icon>
        {{ t('common.add') }}
      </v-btn>
    </template>

    <!-- SELECTED -->
    <template #selection="{ item }">
      <v-icon size="16" class="mr-1">
        mdi-{{ getFilterParam(item.raw).icon }}
      </v-icon>
      <span class="text-body-2">{{ getFilterText(getFilterParam(item.raw)) }}</span>
    </template>

    <!-- ITEM -->
    <template #item="{ item, props }">
      <template v-if="isGroupHeader(item.raw)">
        <v-list-subheader>
          {{ getGroupText(item.raw.header) }}
        </v-list-subheader>
      </template>

      <template v-else-if="isGroupDivider(item.raw)">
        <v-divider />
      </template>

      <template v-else>
        <v-list-item v-bind="props" class="filters-add-item">
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
    </template>
  </v-autocomplete>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
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
}

interface FilterGroupDivider {
  divider: true
}

type FilterGroupedItem = FilterListParam | FilterGroupHeader | FilterGroupDivider

const settingsStore = useSettingsStore()
const {t} = useI18n()

const props = defineProps({
  params: {
    type: Array as PropType<FilterListParam[]>,
    required: true,
  },
  disabled: Boolean,
})

const emit = defineEmits(['add'])

/* =========================
 * STATE
 * ========================= */

const selectedFilter = ref<FilterListParam | null>(null)
const search = ref('')
const filtersRef = ref<{ blur?: () => void } | null>(null)

const isDefaultSearch = computed(() => settingsStore.typingFiltersDefault == '1')

const getFilterText = (item: FilterListParam) =>
  item?.textKey ? t(item.textKey) : item?.text || ''

const getGroupText = (group?: string) =>
  t(`filters.groups.${group}`, group || '')

const isGroupHeader = (item: unknown): item is FilterGroupHeader =>
  typeof item === 'object' && item !== null && 'header' in item

const isGroupDivider = (item: unknown): item is FilterGroupDivider =>
  typeof item === 'object' && item !== null && 'divider' in item

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
  if (!raw || isGroupHeader(raw) || isGroupDivider(raw)) return true
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
    result.push({ header: group })
    result.push(...grouped[group])
    result.push({ divider: true })
  }
  result.pop()
  return result
})

/* =========================
 * METHODS
 * ========================= */

const getFilterParam = (item: unknown): FilterListParam => item as FilterListParam

const add = () => {
  if (!selectedFilter.value) return

  emit('add', [selectedFilter.value])
  selectedFilter.value = null
  filtersRef.value?.blur?.()
}

const getTypeIcon = (type?: string) => getIconDataType(type || '')

const highlight = (text: string) =>
  highlightChars(text, search.value, isDefaultSearch.value)

const getTypeText = (type?: string) =>
  t(`meta.types.${type}`, type || '')
</script>
