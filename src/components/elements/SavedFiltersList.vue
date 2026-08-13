<template>
  <div v-if="filters.length" class="saved-filters-list">
    <div
      v-for="filter in filters"
      :key="filter.id"
      class="saved-filter-card"
      :class="{'saved-filter-card--selectable': selectable}"
      :role="selectable ? 'button' : undefined"
      :tabindex="selectable ? 0 : undefined"
      @click="handleClick(filter)"
      @keydown.enter.prevent="handleClick(filter)"
      @keydown.space.prevent="handleClick(filter)"
    >
      <div class="saved-filter-card__icon" aria-hidden="true">
        <v-icon size="20" icon="mdi-bookmark-outline"/>
      </div>

      <div class="saved-filter-card__meta">
        <div class="saved-filter-card__title-row">
          <span class="saved-filter-card__title">{{ filter.name }}</span>
          <span
            v-if="activeFilterCount(filter) > 0"
            class="saved-filter-card__badge"
          >
            {{ activeFilterCount(filter) }}
          </span>
        </div>

        <div
          v-if="layoutMeta(filter).length"
          class="saved-filter-card__stats"
        >
          <span
            v-for="(part, index) in layoutMeta(filter)"
            :key="`${filter.id}-layout-${index}`"
            class="saved-filter-card__stat"
          >
            <v-icon :icon="part.icon" size="14" class="mr-1"/>
            {{ part.label }}
          </span>
        </div>

        <div
          v-if="(filter.filters ?? []).length"
          class="saved-filter-card__chips"
          @click.stop
        >
          <FiltersChips
            :key="filter.id"
            :filters="filter.filters ?? []"
            readonly
            is-tooltip
          />
        </div>
      </div>

      <div
        v-if="editable || deletable"
        class="saved-filter-card__actions"
        @click.stop
      >
        <v-btn
          v-if="editable"
          icon
          variant="text"
          size="small"
          rounded="pill"
          :aria-label="t('common.edit')"
          @click="emit('edit', filter)"
        >
          <v-icon icon="mdi-pencil" size="18"/>
        </v-btn>
        <v-btn
          v-if="deletable"
          icon
          variant="text"
          size="small"
          rounded="pill"
          color="error"
          :aria-label="t('common.delete')"
          @click="emit('delete', filter)"
        >
          <v-icon icon="mdi-delete-outline" size="18"/>
        </v-btn>
      </div>
    </div>
  </div>

  <div v-else class="text-center pt-4 pb-6">
    <v-img
      src="/images/no-saved-filters.svg"
      max-height="200"
      class="mb-4"
      contain
    />
    <v-alert
      type="info"
      variant="tonal"
      density="compact"
      rounded="xl"
      class="text-start text-caption"
    >
      {{ emptyText || t('filters.no_saved_filters') }}
    </v-alert>
  </div>
</template>

<script setup lang="ts">
import type {PropType} from 'vue'
import {useI18n} from 'vue-i18n'
import FiltersChips from '@/components/elements/FiltersChips.vue'
import {
  hasSavedViewLayout,
  pickSavedViewLayout,
} from '@/utils/savedViewLayout'
import {MEDIA_SORT_PARAMS} from '@/utils/mediaSortFilter'
import {BASE_GROUP_BY_OPTIONS} from '@/utils/itemsGroupByMenu'
import {parseGroupBySetting} from '@/utils/itemsGroupBy'
import type {SavedFilter} from '@/types/stores'

type LayoutMetaPart = {
  icon: string
  label: string
}

const props = defineProps({
  filters: {
    type: Array as PropType<SavedFilter[]>,
    default: () => [],
  },
  selectable: {
    type: Boolean,
    default: false,
  },
  editable: {
    type: Boolean,
    default: false,
  },
  deletable: {
    type: Boolean,
    default: false,
  },
  emptyText: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['apply', 'edit', 'delete'])
const {t} = useI18n()

const SIZE_LABELS = ['XS', 'S', 'M', 'L', 'XL', 'XXL']

function translateSortBy(sortBy: string): string {
  const found = MEDIA_SORT_PARAMS.find((param) => String(param.param) === sortBy)
  return found?.textKey ? t(found.textKey) : sortBy
}

function translateSortDir(sortDir: string | null | undefined): string {
  if (sortDir === 'asc') return t('filters.sort.ascending')
  if (sortDir === 'desc') return t('filters.sort.descending')
  return String(sortDir || '').trim()
}

function translateGroupBy(groupBy: string): string {
  const parsed = parseGroupBySetting(groupBy)
  const found = BASE_GROUP_BY_OPTIONS.find((option) => option.groupBy === parsed.groupBy)
  return found?.textKey ? t(found.textKey) : groupBy
}

function activeFilterCount(filter: SavedFilter): number {
  return (filter.filters ?? []).filter((row) =>
    row
    && row.active !== false
    && !row.removed
    && row.cond != null
    && row.cond !== '',
  ).length
}

function layoutMeta(filter: SavedFilter): LayoutMetaPart[] {
  const layout = pickSavedViewLayout(filter as Record<string, unknown>)
  if (!hasSavedViewLayout(layout)) return []

  const parts: LayoutMetaPart[] = []

  if (layout.size != null) {
    const label = SIZE_LABELS[Number(layout.size) - 1] || String(layout.size)
    parts.push({
      icon: 'mdi-arrow-expand-all',
      label: t('filters.saved_view_size', {size: label}),
    })
  }

  if (layout.sortBy) {
    parts.push({
      icon: 'mdi-sort-variant',
      label: t('filters.saved_view_sort', {
        sort: translateSortBy(layout.sortBy),
        dir: translateSortDir(layout.sortDir),
      }),
    })
  }

  if (layout.groupBy && layout.groupBy !== 'none') {
    parts.push({
      icon: 'mdi-view-agenda-outline',
      label: t('filters.saved_view_group', {group: translateGroupBy(layout.groupBy)}),
    })
  }

  if (layout.filtersJoin === 'or') {
    parts.push({
      icon: 'mdi-set-split',
      label: t('filters.join_or'),
    })
  }

  return parts
}

const handleClick = (filter: SavedFilter) => {
  if (!props.selectable) return
  emit('apply', filter)
}
</script>

<style lang="scss" scoped>
.saved-filters-list {
  display: grid;
  gap: 10px;
  padding-bottom: 16px;
}

.saved-filter-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border-radius: 18px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: rgba(var(--v-theme-surface), 0.72);
  box-shadow: 0 1px 0 rgba(var(--v-theme-on-surface), 0.03);
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.saved-filter-card--selectable {
  cursor: pointer;
}

.saved-filter-card--selectable:hover {
  border-color: rgba(var(--v-theme-primary), 0.22);
  background: rgba(var(--v-theme-primary), 0.04);
  box-shadow: 0 8px 24px rgba(var(--v-theme-on-surface), 0.06);
  transform: translateY(-1px);
}

.saved-filter-card--selectable:focus-visible {
  outline: 2px solid rgba(var(--v-theme-primary), 0.45);
  outline-offset: 2px;
}

.saved-filter-card__icon {
  flex: 0 0 42px;
  width: 42px;
  height: 42px;
  border-radius: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.1);
}

.saved-filter-card__meta {
  flex: 1 1 auto;
  min-width: 0;
}

.saved-filter-card__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.saved-filter-card__title {
  font-size: 0.975rem;
  font-weight: 650;
  line-height: 1.3;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.saved-filter-card__badge {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.12);
}

.saved-filter-card__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: 4px;
}

.saved-filter-card__stat {
  display: inline-flex;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 0.75rem;
  line-height: 1.35;
  font-variant-numeric: tabular-nums;
}

.saved-filter-card__chips {
  margin-top: 8px;

  :deep(.v-chip) {
    margin: 2px 4px 2px 0 !important;
  }

  :deep(.v-chip.v-chip--size-small) {
    --v-chip-height: 24px;
    font-size: 0.7rem;
  }
}

.saved-filter-card__actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border-radius: 999px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: rgba(var(--v-theme-surface), 0.85);
  opacity: 0.72;
  transition: opacity 0.15s ease;
}

.saved-filter-card:hover .saved-filter-card__actions,
.saved-filter-card:focus-within .saved-filter-card__actions {
  opacity: 1;
}

@media (max-width: 700px) {
  .saved-filter-card {
    flex-wrap: wrap;
  }

  .saved-filter-card__actions {
    margin-left: auto;
    opacity: 1;
  }
}
</style>
