<template>
  <div class="filter-chips d-flex flex-wrap align-center">
    <v-chip
      v-if="itemsStore.find_duplicates"
      class="filter-chip"
      :class="{readonly: isTooltip || readonly}"
      color="primary"
      size="small"
      variant="tonal"
      :title="t('filters.deactivate_filter')"
      @click="switchOffDuplicates"
    >
      <v-icon size="14" class="mr-1">mdi-content-duplicate</v-icon>
      {{ duplicatesLabel }}
      <v-icon v-if="!readonly && !isTooltip" size="13" class="filter-chip__dismiss" aria-hidden="true">mdi-close</v-icon>
    </v-chip>

    <v-chip
      v-if="hasListScope"
      class="filter-chip"
      :class="{readonly: isTooltip || readonly}"
      color="primary"
      size="small"
      variant="tonal"
      :title="t('filters.deactivate_filter')"
      @click="switchOffListScope"
    >
      <v-icon size="14" class="mr-1">{{ listScopeIcon }}</v-icon>
      {{ listScopeLabel }}
      <v-icon v-if="!readonly && !isTooltip" size="13" class="filter-chip__dismiss" aria-hidden="true">mdi-close</v-icon>
    </v-chip>

    <v-chip
      v-for="(filter, index) in filters"
      :key="index"
      v-show="shouldShowFilter(filter)"
      class="filter-chip"
      :class="{
        readonly: isTooltip || readonly,
        'filter-chip--inactive': isTooltip && !isFilterRowActive(filter),
      }"
      :color="getChipColor(filter)"
      size="small"
      variant="tonal"
      :disabled="(filter.lock && !isTooltip) || !itemsStore.isFiltersLoaded"
      :title="getChipTitle(filter)"
      @click="deactivate(index)"
    >
      <v-icon
        v-if="filter.lock"
        size="14"
        class="mr-1"
      >
        mdi-lock
      </v-icon>

      <v-icon size="15" class="filter-chip__icon" aria-hidden="true">
        mdi-{{ getBy(filter.param, 'icon') || 'filter-outline' }}
      </v-icon>
      <span class="filter-chip__field">{{ getBy(filter.param, 'text') }}</span>
      <span class="filter-chip__condition">{{ getCond(filter.type, filter.cond, 'text') }}</span>

      <template v-if="filter.type === 'array'">
        <span class="filter-chip__value">{{ getArrayPreview(filter).text }}</span>
        <span v-if="getArrayPreview(filter).hidden" class="filter-chip__more">
          +{{ getArrayPreview(filter).hidden }}
        </span>
      </template>

      <span v-else-if="filter.type === 'number'" class="filter-chip__value">
        <span v-html="getValForTypeNumber(filter.param, filter.val)"/>
      </span>

      <span v-else-if="filter.type === 'date'" class="filter-chip__value">
        {{ formatFilterDateDisplay(filter.val, locale) }}
      </span>

      <span v-else-if="filter.type !== 'boolean'" class="filter-chip__value">
        {{ filter.val }}
      </span>
      <v-icon v-if="!readonly && !isTooltip && !filter.lock" size="13" class="filter-chip__dismiss" aria-hidden="true">mdi-close</v-icon>
    </v-chip>
  </div>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import type { PropType } from 'vue'
import {useI18n} from 'vue-i18n'
import Cols from '../../../app/configs/filter-cols'

import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useItemsFiltersController} from '@/composable/itemsFiltersController'
import {getCurrentMediaType} from '@/utils/mediaType'
import {getListCond, getReadableFileSize, getReadableDuration, formatFilterDateDisplay} from '@/services/formatUtils'
import {getDuplicatesModeLabelKey} from '@/utils/mediaSortFilter'
import type { FilterObject, FilterListParam } from '@/types/common'
import {useCatalogSources} from '@/composable/useCatalogSources'

const props = defineProps({
  filters: {
    type: Array as PropType<FilterObject[]>,
    required: true,
  },
  isTooltip: {
    type: Boolean,
    default: false,
  },
  readonly: {
    type: Boolean,
    default: false,
  },
})
const {label: catalogLabel} = useCatalogSources(computed(() => props.filters.some(filter => filter.param === 'source')))

const colsCache = ref<FilterListParam[] | null>(null)

const itemsStore = useItemsStore()
const appStore = useAppStore()
const filtersController = useItemsFiltersController()
const {t, locale} = useI18n()

const hasActiveScopeFilters = computed(() =>
  (itemsStore.filters || []).some((filter) =>
    filter.active !== false
    && !filter.removed
    && filter.cond != null
    && filter.cond !== '',
  ),
)

const duplicatesLabel = computed(() => {
  if (itemsStore.type !== 'media') {
    return hasActiveScopeFilters.value
      ? t('filters.show_only_duplicates_by_filesize_within_filter')
      : t('filters.show_only_duplicates_by_filesize')
  }

  const mediaType = getCurrentMediaType(
    appStore.mediaTypes,
    itemsStore.environment?.media_type_id
  )
  return t(getDuplicatesModeLabelKey(mediaType, itemsStore.duplicates_by, {
    withinFilter: hasActiveScopeFilters.value,
  }))
})

const meta = computed(() => appStore.meta)
const tags = computed(() => appStore.tags)

const hasListScope = computed(() =>
  Array.isArray(itemsStore.listScopeIds) && itemsStore.listScopeIds.length > 0,
)

const listScopeKind = computed(() => itemsStore.listScope?.kind || 'visualSimilar')

const listScopeIcon = computed(() => {
  if (listScopeKind.value === 'fromPlayer') {
    return 'mdi-library'
  }
  if (listScopeKind.value === 'inbox') {
    return 'mdi-inbox-arrow-down'
  }
  if (
    listScopeKind.value === 'semantic'
    || listScopeKind.value === 'similar'
    || listScopeKind.value === 'clipSimilar'
  ) {
    return 'mdi-brain'
  }
  return 'mdi-image-search-outline'
})

const listScopeLabel = computed(() => {
  const label = String(itemsStore.listScope?.label || '').trim()
  if (listScopeKind.value === 'fromPlayer') {
    return label
      ? t('filters.from_player_scope_named', {name: label})
      : t('filters.from_player_scope')
  }
  if (listScopeKind.value === 'inbox') {
    return label || t('filters.inbox_scope')
  }
  if (listScopeKind.value === 'semantic') {
    if (label) {
      return t('filters.semantic_search_scope_query', {query: label})
    }
    return t('filters.semantic_search_scope')
  }
  if (listScopeKind.value === 'similar' || listScopeKind.value === 'clipSimilar') {
    return label || t('filters.similar_scope')
  }
  return t('filters.more_like_this_scope')
})

const switchOffDuplicates = () => {
  if (props.readonly || props.isTooltip) return
  itemsStore.find_duplicates = false
  itemsStore.duplicates_by = null
  void filtersController.apply()
}

const switchOffListScope = () => {
  if (props.readonly || props.isTooltip) return
  itemsStore.listScopeIds = null
  itemsStore.listScope = null
  void filtersController.apply()
}

const deactivate = (index: number) => {
  if (props.readonly || props.isTooltip) return
  filtersController.deactivate(index)
}

const isFilterRowActive = (filter: FilterObject) => filter.active !== false && !filter.removed

const shouldShowFilter = (filter: FilterObject) => {
  if (filter.removed) return false
  if (props.isTooltip) return true
  return isFilterRowActive(filter)
}

const getChipColor = (filter: FilterObject) => {
  if (!props.isTooltip) return 'primary'
  return isFilterRowActive(filter) ? 'primary' : 'default'
}

const getChipTitle = (filter: FilterObject) => {
  const description = [getBy(filter.param, 'text'), getCond(filter.type, filter.cond, 'text'), getFilterValue(filter)].filter(Boolean).join(' ')
  if (!props.isTooltip && !props.readonly && !filter.lock) return `${description} · ${t('filters.deactivate_filter')}`
  return description
}

const getBy = (param: string | number | null, show: string) => {
  if (param == null) return ''
  const isMeta = /\d/.test(param.toString())

  if (isMeta) {
    const key = show === 'text' ? 'name' : show
    const m = meta.value.find(i => i.id == param)
    return (m?.[key as keyof typeof m] as string) || ''
  }

  if (!colsCache.value) {
    colsCache.value = Object.values(Cols).flat() as FilterListParam[]
  }

  const col = colsCache.value.find(i => i.param === param)
  if (show === 'text' && col?.textKey) return t(col.textKey)
  return (col?.[show as keyof FilterListParam] as string) || ''
}

const getCond = (type: string | null, cond: string | null, show: string) => {
  try {
    const conds = getListCond(type)
    const found = conds.find(i => i.cond === cond)
    if (show === 'text' && found?.text) {
      const key = found.text.replaceAll(' ', '_')
      return t(`filters.conditions.${key}`, found.text)
    }
    return (found?.[show as keyof typeof found] as string) || ''
  } catch (error) {
    console.error('Error getting condition:', error)
    return ''
  }
}

const getArrayLabels = (filter: FilterObject): string[] => {
  if (!Array.isArray(filter.val)) return []
  if (filter.param === 'source' || filter.param === 'availability') {
    return filter.val.map(value => catalogLabel(filter.param, value))
  }
  if (filter.param === 'country' || filter.param === 'ext') return filter.val.map(String)
  const names = new Map(tags.value.filter(tag => tag.metaId == filter.param).map(tag => [tag.id, tag.name]))
  return filter.val.map(id => names.get(id) || String(id))
}

const getArrayPreview = (filter: FilterObject) => {
  const labels = getArrayLabels(filter)
  // Always show the first tag; add a second only when the names stay compact.
  const shown = labels.length > 1 && Array.from(labels.slice(0, 2).join(', ')).length <= 32 ? 2 : 1
  return {text: labels.slice(0, shown).join(', '), hidden: Math.max(0, labels.length - shown)}
}

const getFilterValue = (filter: FilterObject): string => {
  if (filter.type === 'array') return getArrayLabels(filter).join(', ')
  if (filter.type === 'date') return formatFilterDateDisplay(filter.val, locale.value)
  if (filter.type === 'number') return String(getValForTypeNumber(filter.param, filter.val) ?? '')
  return filter.type === 'boolean' ? '' : String(filter.val ?? '')
}

const getValForTypeNumber = (parameter: string | number | null, number: unknown) => {
  const numeric = Number(number)
  if (parameter === 'filesize') {
    return getReadableFileSize(numeric)
  }
  if (parameter === 'duration') {
    return getReadableDuration(numeric)
  }
  return number
}
</script>

<style scoped lang="scss">
.filter-chips {
  gap: 6px;
  min-width: 0;
}

.filter-chip.v-chip {
  height: 30px;
  max-width: 100%;
  margin: 0;
  padding-inline: 9px;
  border: 1px solid rgba(var(--v-theme-primary), 0.16);
  border-radius: 9px;
  font-size: 12px;
  letter-spacing: 0;
  transition: border-color 150ms ease, box-shadow 150ms ease;

  &:hover:not(.readonly) {
    border-color: rgba(var(--v-theme-primary), 0.38);
    box-shadow: 0 2px 6px rgba(var(--v-theme-primary), 0.08);
  }

  :deep(.v-chip__content) {
    gap: 6px;
    min-width: 0;
    overflow: hidden;
  }
}

.filter-chip__icon { flex-shrink: 0; opacity: 0.8; }
.filter-chip__field {
  min-width: 0;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
}
.filter-chip__condition { flex-shrink: 0; opacity: 0.65; }
.filter-chip__value {
  min-width: 0;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 650;
}
.filter-chip__more {
  flex-shrink: 0;
  padding: 1px 5px;
  border-radius: 5px;
  background: rgba(var(--v-theme-primary), 0.1);
  font-size: 11px;
  font-weight: 650;
  line-height: 18px;
  font-variant-numeric: tabular-nums;
}
.filter-chip__dismiss {
  flex-shrink: 0;
  margin-inline-start: 2px;
  opacity: 0.5;
}
.filter-chip:hover .filter-chip__dismiss { opacity: 1; }

.readonly {
  pointer-events: none;
}

.filter-chip--inactive {
  opacity: 0.55;
}
</style>
