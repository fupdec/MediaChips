<template>
  <div
    class="filters-panel"
    :class="{
      'filters-panel--embedded': variant === 'embedded',
      'filters-panel--top': variant === 'top',
      'filters-panel--drawer': variant === 'drawer',
      'filters-panel--no-header': hideHeader,
    }"
  >
    <div
      v-if="!hideHeader"
      class="filters-panel__header"
    >
      <div class="d-flex align-center ga-2 min-width-0">
        <div class="d-flex align-center min-width-0">
          <v-icon
            v-if="variant === 'drawer' || variant === 'top'"
            start
            :size="variant === 'top' ? 18 : undefined"
          >
            mdi-filter
          </v-icon>
          <span :class="variant === 'drawer' || variant === 'top' ? (variant === 'top' ? 'filters-panel__heading' : 'text-h6') : 'filters-panel__title'">
            {{ t('filters.title') }}
          </span>
        </div>

        <v-switch
          v-if="filters.length >= 1"
          :model-value="editMode"
          color="primary"
          density="compact"
          hide-details
          inset
          class="flex-grow-0 ma-0 filters-edit-switch"
          :aria-label="t('filters.edit_mode')"
          :title="t('filters.edit_mode_hint')"
          @update:model-value="emit('update:editMode', $event)"
        >
          <template #thumb>
            <v-icon
              v-if="editMode"
              size="x-small"
            >
              mdi-pencil
            </v-icon>
          </template>
        </v-switch>

        <SettingsSegmentedControl
          v-if="advancedUi && conditionsCount >= 2"
          :disabled="activeConditionsCount < 2"
          :model-value="filtersJoin"
          @update:model-value="onFiltersJoinChange"
          :label="t('filters.join_and')"
          :items="[
            {value: 'and', title: t('filters.join_and'), tooltip: t('filters.join_and_hint')},
            {value: 'or', title: t('filters.join_or'), tooltip: t('filters.join_or_hint')},
          ]"
          compact
        />
      </div>

      <v-spacer/>

      <div class="d-flex align-center ga-1 flex-shrink-0">
        <v-btn
          v-if="variant === 'top'"
          :color="isFiltersChanged ? 'success' : 'primary'"
          rounded="xl"
          variant="flat"
          size="small"
          class="filters-panel__apply"
          @click="emit('apply')"
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
          variant="text"
          icon
          size="small"
          :aria-label="t('appbar.buttons.hide_filters')"
          @click="emit('close')"
        >
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </div>
    </div>

    <div
      class="filters-panel__toolbar"
      :class="{'filters-panel__toolbar--deck': variant === 'top'}"
    >

      <!-- Drawer / classic stacked toolbar -->
      <template v-if="variant !== 'top'">
        <div
          class="d-flex align-center mb-2 ga-2 filters-panel__actions"
          :class="editMode ? 'justify-space-between' : ''"
        >
          <v-btn
            v-if="canToggleAiSection"
            :variant="showAiBlock ? 'tonal' : 'outlined'"
            rounded="xl"
            size="small"
            color="primary"
            :aria-label="showAiBlock ? t('filters.ai_hide') : t('filters.ai_show')"
            :title="showAiBlock ? t('filters.ai_hide') : t('filters.ai_show')"
            @click="toggleAiBlock"
          >
            <v-icon
              start
              size="small"
            >
              mdi-creation
            </v-icon>
            {{ t('filters.ai_short') }}
          </v-btn>

          <v-btn
            v-if="editMode"
            variant="tonal"
            rounded="xl"
            size="small"
            color="primary"
            @click="emit('open-saved')"
          >
            <v-icon
              start
              size="small"
            >
              mdi-content-save
            </v-icon>
            {{ t('filters.saved_short') }}
          </v-btn>

          <v-btn
            v-if="editMode && showRemoveAll"
            variant="tonal"
            rounded="xl"
            size="small"
            color="error"
            :aria-label="t('filters.remove_all')"
            :title="t('filters.remove_all')"
            @click="emit('remove-all')"
          >
            <v-icon
              start
              size="small"
            >
              mdi-filter-off
            </v-icon>
            {{ t('filters.remove_all') }}
          </v-btn>

          <v-btn
            :color="isFiltersChanged ? 'success' : 'primary'"
            rounded="xl"
            variant="flat"
            size="small"
            :block="variant === 'drawer' && !editMode"
            :class="{
              'flex-grow-1': variant === 'drawer' && !editMode,
            }"
            @click="emit('apply')"
          >
            <v-icon
              start
              size="small"
            >
              mdi-check
            </v-icon>
            {{ t('common.apply') }}
          </v-btn>
        </div>

        <FiltersAdd
          v-if="isReady && (editMode || filters.length === 0)"
          class="my-2"
          :params="listBy"
          @add="emit('add', $event)"
        />
      </template>

    </div>

    <div
      v-if="$slots['conditions-head']"
      class="filters-panel__match"
    >
      <slot name="conditions-head"/>
    </div>

    <div
      class="filters-panel__body"
      :class="{'filters-panel__body--empty': variant === 'top' && isEmpty}"
    >
    <div
      v-if="isReady"
      class="filters-list"
    >
      <Draggable
        v-if="filters.length > 0 && editMode"
        :model-value="filters"
        v-bind="dragOptions"
        :item-key="dragItemKey"
        handle=".drag-handle"
        class="filters-draggable"
        @update:model-value="emit('update:filters', $event)"
        @end="emit('reorder')"
      >
        <template #item="{ element: f, index: i }">
          <FilterRow
            :filter="f"
            :index="i"
            :list-by="listBy"
            editable
            @set-by="emit('set-by', $event, i)"
            @set-condition="emit('set-condition', $event, i)"
            @set-value="emit('set-value', $event, i)"
            @set-active="emit('set-active', $event, i)"
            @remove="emit('remove', i)"
            @duplicate="emit('duplicate', i)"
            @pick-date="emit('pick-date', i)"
            @valid="emit('valid', $event)"
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
          @set-by="emit('set-by', $event, i)"
          @set-condition="emit('set-condition', $event, i)"
          @set-value="emit('set-value', $event, i)"
          @set-active="emit('set-active', $event, i)"
          @remove="emit('remove', i)"
          @duplicate="emit('duplicate', i)"
          @pick-date="emit('pick-date', i)"
          @valid="emit('valid', $event)"
        />
      </template>

      <div
        v-else-if="variant === 'top'"
        class="filters-panel__empty"
      >
        <span class="filters-panel__empty-tile">
          <v-icon size="22">mdi-filter-variant</v-icon>
        </span>
        <div class="filters-panel__empty-title">{{ t('filters.empty_title') }}</div>
        <div class="filters-panel__empty-hint">{{ t('filters.empty_hint') }}</div>
      </div>

      <div
        v-else
        class="text-center py-6 overline"
      >
        <v-img
          src="/images/filters/filters-none.svg"
          max-height="120"
          max-width="200"
          class="my-2 mx-auto"
          contain
        />
        <div>{{ t('filters.no_filters') }}</div>
      </div>
    </div>

    <div
      v-if="variant === 'top' && isReady"
      class="filters-panel__bottom"
      :class="{'filters-panel__bottom--empty': isEmpty}"
    >
      <FiltersAdd
        v-if="addOpen"
        class="filters-panel__add"
        hide-floating-label
        auto-open
        :params="listBy"
        @add="onAddFilter"
        @close="addOpen = false"
      />
      <v-btn
        v-else
        :variant="isEmpty ? 'flat' : 'text'"
        color="primary"
        :size="isEmpty ? 'default' : 'small'"
        prepend-icon="mdi-plus"
        class="filters-panel__link-btn"
        @click="addOpen = true"
      >
        {{ t('filters.add_filter') }}
      </v-btn>

      <v-btn
        v-if="canToggleAiSection"
        variant="text"
        :color="showAiBlock ? 'primary' : undefined"
        :size="isEmpty ? 'default' : 'small'"
        prepend-icon="mdi-creation"
        class="filters-panel__link-btn"
        :aria-pressed="showAiBlock"
        @click="toggleAiBlock"
      >
        {{ t('filters.describe_with_ai') }}
      </v-btn>

      <v-spacer/>

      <v-btn
        v-if="showRemoveAll"
        variant="text"
        color="error"
        size="small"
        prepend-icon="mdi-filter-off"
        class="filters-panel__link-btn"
        @click="emit('remove-all')"
      >
        {{ t('filters.remove_all') }}
      </v-btn>
    </div>
    </div>

    <div
      v-if="showAiSection"
      class="filters-panel__ai-section"
    >
      <LocalAiAssistPanel
        :key="props.assistActive ? 'filter-ai-open' : 'filter-ai-idle'"
        mode="filter"
        :prompt="filterAiPrompt"
        :context="filterAiContext"
        :active="props.assistActive"
        :can-undo="canUndoAiFilters"
        @apply="emit('apply-ai-filters', $event)"
        @undo="emit('undo-ai-filters')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import SettingsSegmentedControl from '@/components/ui/SettingsSegmentedControl.vue'
import {computed, defineAsyncComponent, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import FilterRow from '@/components/app/FilterRow.vue'
import FiltersAdd from '@/components/dialogs/filters/FiltersAdd.vue'
import LocalAiAssistPanel from '@/components/regex/LocalAiAssistPanel.vue'
import {LOCAL_AI_UI_ENABLED} from '@shared/features'
import {useItemsStore} from '@/stores/items'
import {useSettingsStore} from '@/stores/settings'
import type {FilterObject, FilterListParam} from '@/types/common'

const advancedUi = computed(() => useSettingsStore().advancedUi === '1')

const Draggable = defineAsyncComponent(() => import('vuedraggable'))

const REMOVE_ALL_MIN_FILTERS = 5
const AI_BLOCK_STORAGE_KEY = 'filters.showAiAssist'

function readShowAiBlock (): boolean {
  try {
    const raw = localStorage.getItem(AI_BLOCK_STORAGE_KEY)
    if (raw === '0' || raw === 'false') return false
    if (raw === '1' || raw === 'true') return true
  } catch {
    /* ignore */
  }
  return false
}

const props = withDefaults(defineProps<{
  variant?: 'drawer' | 'embedded' | 'top'
  hideHeader?: boolean
  editMode: boolean
  filters: FilterObject[]
  listBy: FilterListParam[]
  isReady?: boolean
  isFiltersChanged?: boolean
  filterAiPrompt: string
  filterAiContext: Record<string, unknown>
  dragOptions: Record<string, unknown>
  /** Re-check Local AI when the filters panel is shown. */
  assistActive?: boolean
  canUndoAiFilters?: boolean
}>(), {
  variant: 'drawer',
  hideHeader: false,
  isReady: false,
  isFiltersChanged: false,
  assistActive: true,
  canUndoAiFilters: false,
})

const emit = defineEmits([
  'update:editMode',
  'update:filters',
  'close',
  'apply',
  'apply-ai-filters',
  'undo-ai-filters',
  'add',
  'reorder',
  'open-saved',
  'set-by',
  'set-condition',
  'set-value',
  'set-active',
  'remove',
  'duplicate',
  'remove-all',
  'pick-date',
  'valid',
])

const {t} = useI18n()
const itemsStore = useItemsStore()

const filtersJoin = computed(() => itemsStore.filtersJoin === 'or' ? 'or' : 'and')

/** AND/OR is shown with two or more conditions and works once two are on. */
const conditionsCount = computed(() =>
  props.filters.filter((filter) => !filter.removed).length,
)
const activeConditionsCount = computed(() =>
  props.filters.filter((filter) => filter.active && !filter.removed).length,
)

const onFiltersJoinChange = (value: unknown) => {
  const next = value === 'or' ? 'or' : 'and'
  if (itemsStore.filtersJoin === next) return
  itemsStore.filtersJoin = next
  emit('apply')
}

const showAiBlock = ref(readShowAiBlock())
const addOpen = ref(false)
const isEmpty = computed(() => props.filters.length === 0)

const onAddFilter = (params: unknown) => {
  emit('add', params)
  addOpen.value = false
}

const canToggleAiSection = computed(() =>
  LOCAL_AI_UI_ENABLED && (props.variant !== 'top' || props.editMode || props.filters.length === 0),
)

const showAiSection = computed(() => canToggleAiSection.value && showAiBlock.value)

const showRemoveAll = computed(() =>
  props.filters.filter((filter) => !filter.removed && !filter.lock).length > REMOVE_ALL_MIN_FILTERS,
)

function toggleAiBlock () {
  showAiBlock.value = !showAiBlock.value
  try {
    localStorage.setItem(AI_BLOCK_STORAGE_KEY, showAiBlock.value ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function dragItemKey(filter: FilterObject) {
  return String(filter.id ?? filter.clientKey)
}
</script>

<style lang="scss">
.filters-panel {
  display: grid;
  grid-template-rows: auto auto 1fr;
  overflow: hidden;
  max-height: 100%;
  height: 100%;
  min-height: 0;

  &--drawer {
    pointer-events: all;
    background-color: rgb(var(--v-theme-background)) !important;
    padding: 8px 8px 16px;
  }

  &--embedded {
    padding: 0 4px 8px;
  }

  &--top {
    padding: 0;
  }

  &--no-header {
    grid-template-rows: auto 1fr;

    &.filters-panel--top {
      padding: 0;
    }
  }
}

.filters-panel__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 4px 12px;
  min-width: 0;
}

.filters-panel__title {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.6;
}

.filters-panel__toolbar {
  padding: 0 4px;
  min-width: 0;
}

.filters-panel__ai-section {
  margin-top: 0;
  margin-bottom: 8px;
  padding: 6px 8px;
  border-radius: 12px;
  background: rgba(var(--v-theme-primary), 0.04);
  border: 1px solid rgba(var(--v-theme-primary), 0.1);
}

.filters-list {
  overflow-y: auto;
  min-height: 0;
  padding: 4px 8px 0 4px;
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

// Dropdown of the catalog (source / availability) filters: compact rows, small checkboxes.
.filter-catalog-menu {
  .v-list {
    padding: 4px;
  }

  .v-list-item {
    min-height: 32px;
    padding-inline: 8px;
    border-radius: 8px;
    --v-list-prepend-gap: 8px;
  }

  .v-list-item-title {
    font-size: 0.8125rem;
    line-height: 1.25;
  }

  .v-list-item__prepend > .v-icon,
  .v-list-item__prepend .v-selection-control .v-icon {
    font-size: 18px;
    width: 18px;
    height: 18px;
  }

  .v-selection-control {
    --v-selection-control-size: 24px;
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

.filters-panel--embedded {
  .filters-list {
    padding: 4px 2px 0;
  }

  .filter-form .filter {
    padding-inline: 6px !important;
  }
}

.filters-panel--top {
  padding: 0 !important;
  grid-template-rows: none;
  grid-auto-rows: auto;

  // Empty state: one centered card with the two ways to start.
  .filters-panel__body--empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 28px 16px 24px;
    text-align: center;
  }

  .filters-panel__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }

  .filters-panel__empty-tile {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 12px;
    color: rgb(var(--v-theme-primary));
    background: rgba(var(--v-theme-primary), 0.14);
  }

  .filters-panel__empty-title {
    font-size: 1.0625rem;
    font-weight: 600;
  }

  .filters-panel__empty-hint {
    max-width: 420px;
    font-size: 0.8125rem;
    line-height: 1.4;
    color: rgba(var(--v-theme-on-surface), 0.6);
  }

  .filters-panel__bottom--empty {
    justify-content: center;
    padding-top: 16px;
  }

  .filters-panel__bottom {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 8px;
    padding: 10px 0 0;
    min-width: 0;
    min-height: 42px;
  }

  .filters-panel__link-btn {
    height: 32px !important;
    border-radius: 8px !important;
    font-size: 0.8125rem;
    text-transform: none;
    letter-spacing: normal;
  }

  .filters-panel__ai-section {
    margin-top: 10px;
    margin-bottom: 0;
  }

  .filters-panel__header {
    padding: 0 0 8px;
    gap: 8px;
  }

  .filters-panel__heading {
    font-size: 0.8125rem;
    font-weight: 600;
    letter-spacing: 0.01em;
  }

  .filters-panel__toolbar {
    padding: 0;
    margin: 0;
  }

  // Section header with the toolbar on its right (replaces the former tinted toolbar row).
  .filters-panel__toolbar .filters-panel__section-head {
    flex-wrap: wrap;
    row-gap: 4px;
    padding: 10px 0 12px;
  }

  .filters-panel__head-actions {
    display: flex;
    align-items: center;
    flex-wrap: nowrap;
    gap: 8px;
  }

  .filters-panel__toolbar-btn {
    flex: 0 0 auto;
    max-width: 220px;
    height: 32px !important;
    font-size: 0.75rem;
    text-transform: none;
    letter-spacing: normal;

    .text-truncate {
      max-width: 140px;
    }
  }

  .filters-panel__add {
    flex: 0 1 280px;
    width: 280px;
    max-width: 320px;
    min-width: 220px;
    margin: 0 !important;

    :deep(.v-input__control) {
      min-width: 0;
    }

    :deep(.v-btn) {
      border-radius: 8px !important;
    }

    :deep(.v-field) {
      --v-input-control-height: 32px;
      border-radius: 8px !important;
      font-size: 0.75rem;
    }

    :deep(.v-field__input) {
      min-height: 32px !important;
      max-height: 32px !important;
      padding-top: 0 !important;
      padding-bottom: 0 !important;
      padding-inline: 10px 8px !important;
      font-size: 0.75rem !important;
      line-height: 1.2 !important;
      flex-wrap: nowrap !important;
      overflow: hidden;
      align-items: center;
    }

    :deep(.v-autocomplete__selection) {
      max-width: 100%;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-size: 0.75rem !important;
      line-height: 1.2 !important;
      margin-inline-end: 0;
    }

    :deep(.v-autocomplete__selection .v-icon),
    :deep(.v-autocomplete__selection .mr-1) {
      font-size: 14px !important;
      width: 14px;
      height: 14px;
      margin-inline-end: 4px !important;
    }

    :deep(.v-autocomplete__selection .text-body-2) {
      font-size: 0.75rem !important;
      line-height: 1.2 !important;
    }

    :deep(.v-field__input input) {
      min-width: 0 !important;
      font-size: 0.75rem !important;
    }

    :deep(.v-field__append-inner .v-icon) {
      font-size: 16px !important;
    }

    :deep(.v-input__append) {
      margin-inline-start: 4px !important;
      padding: 0 !important;
      align-self: center;
    }

    :deep(.v-input__append .v-btn) {
      width: 32px !important;
      height: 32px !important;
      min-width: 32px !important;
      min-height: 32px !important;
      padding: 0 !important;
    }

    :deep(.v-input__append .v-btn .v-icon) {
      margin: 0 !important;
      font-size: 16px !important;
    }

    :deep(.v-label) {
      font-size: 0.6875rem;
    }
  }

  .filters-panel__actions {
    justify-content: flex-start;
    flex-wrap: wrap;
    margin-bottom: 6px !important;
  }

  .filters-panel__apply {
    min-width: 0;
    height: 28px;
    font-size: 0.75rem;
  }

  .filters-edit-switch {
    transform: scale(0.85);
    transform-origin: center left;
  }

  .filters-list {
    display: grid;
    // Wide panels: as many columns as fit (each at least 560px), so rows don't stretch across a huge monitor.
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 560px), 1fr));
    gap: 6px;
    padding: 0;
    max-height: min(40vh, 360px);
    overflow-y: auto;
    align-content: start;
    align-items: start;
  }

  .filters-list:has(.filters-draggable),
  .filters-list:has(.overline) {
    display: block;
  }

  .filters-draggable {
    display: grid;
    // Wide panels: as many columns as fit (each at least 560px), so rows don't stretch across a huge monitor.
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 560px), 1fr));
    gap: 6px;
    align-content: start;
    align-items: start;
    justify-items: start;
  }

  .filter-form {
    min-width: 0;
    width: 100%;
    max-width: none;
    height: auto;
    display: flex;
  }

  .filter-form .filter {
    margin-bottom: 0 !important;
    width: 100%;
    max-width: none;
    height: auto;
    min-height: 38px;
    border-radius: 10px !important;
    padding: 3px 8px 3px 12px !important;
    box-sizing: border-box;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    gap: 10px;
    background: rgb(var(--v-theme-surface)) !important;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
    box-shadow: 0 1px 2px rgba(var(--v-theme-on-surface), 0.04);

    &.active:focus-within {
      border-color: rgba(var(--v-theme-primary), 0.45);
    }

    // A row marked for removal keeps its red edge (also while focused) and the same corners as the others.
    &.removed,
    &.removed:focus-within {
      border-style: solid;
      border-color: rgba(245, 82, 82, 0.6);
    }

    // Fields are quiet tinted pills instead of outlined boxes.
    .v-field--variant-outlined {
      border-radius: 8px;
      background: rgba(var(--v-theme-on-surface), 0.06);

      .v-field__outline {
        --v-field-border-opacity: 0;
      }

      &.v-field--focused .v-field__outline {
        --v-field-border-opacity: 0.8;
        color: rgb(var(--v-theme-primary));
      }
    }

    // Rows keep one height: the value sits in the same line as the name.
    &:has(.filter__body) {
      min-height: 38px;
    }
  }

  .filter__header {
    gap: 4px;
    flex: 0 0 28px;
    height: 28px;
    min-height: 28px;
    max-height: 28px;
    padding: 0 !important;
    margin: 0 !important;
    align-items: center;

    .v-btn {
      width: 24px !important;
      height: 24px !important;
      min-width: 24px !important;
      padding: 0 !important;
      border-radius: 8px !important;

      .v-icon {
        font-size: 16px !important;
        width: 16px !important;
        height: 16px !important;
      }
    }
  }

  .filter__title_block {
    flex: 1 1 auto;
    min-width: 0;
    gap: 0 !important;
    padding: 0 !important;
    margin: 0 !important;
  }

  .filter__title_content {
    flex: 1 1 auto;
    min-width: 0;
    gap: 0 !important;
    padding-left: 0 !important;
    margin: 0 !important;
  }

  .filter__title {
    flex: 1 1 auto;
    min-width: 0;
    max-width: none;
    font-size: 0.8125rem !important;
    font-weight: 500 !important;
    line-height: 1.25;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin: 0 !important;
    padding: 0 !important;
  }

  .filter__icon {
    margin-right: 8px !important;
    margin-left: 0 !important;
    font-size: 14px !important;
    width: 14px !important;
    height: 14px !important;
    opacity: 0.7;
  }

  // Conditions saved as turned off are muted; clicking the row turns them on.
  .filter-form .filter.filter--muted {
    background: transparent !important;
    border-style: dashed;
    border-color: rgba(var(--v-theme-on-surface), 0.2);

    .filter__title_content {
      opacity: 0.55;
    }
  }

  // One fixed width for symbol and word conditions, so every value field starts on the same line.
  .filter__cond {
    flex: 0 0 76px;
    width: 76px;
    max-width: 76px;
    min-width: 76px;
    margin: 0 !important;
    padding: 0 !important;

    .v-field {
      --v-input-control-height: 28px;
    }

    .v-field__input {
      min-height: 28px !important;
      padding-top: 0 !important;
      padding-bottom: 0 !important;
      padding-inline: 8px 0 !important;
      font-size: 0.75rem;
    }

    // The closed select shows as much of the condition text as fits, cut off cleanly, no ellipsis.
    .v-select__selection {
      min-width: 0;
      max-width: 100%;
      margin-inline-end: 0;
    }

    .v-field__append-inner {
      padding-inline-start: 0 !important;
    }
  }

  // Unit hint after a number ("5.16 MB") matches the value's size instead of the default field text.
  .filter-form .v-text-field__suffix {
    min-height: 28px;
    padding-top: 0;
    padding-bottom: 0;
    align-items: center;
    font-size: 0.75rem;
    opacity: 0.7;
  }

  .filter__body {
    display: flex;
    align-items: center;
    flex: 1 1 auto;
    width: auto;
    min-width: 0;
    min-height: 28px;
    padding: 0 !important;
    margin: 0 !important;
    overflow: visible;

    > * {
      margin: 0 !important;
    }

    .ma-1,
    .pt-0,
    .pa-1 {
      margin: 0 !important;
      padding: 0 !important;
    }

    .v-input,
    .v-text-field,
    .v-number-input,
    .v-rating {
      margin: 0 !important;
      padding: 0 !important;
      width: 100%;
    }

    .filter__number {
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
      min-height: 30px;

      .v-number-input {
        width: auto;
        flex: 1 1 auto;
        min-width: 0;
      }
    }

    .filter__rating,
    .v-rating {
      display: inline-flex;
      align-items: center;
      justify-content: flex-start;
      width: auto !important;
      max-width: 100%;
      height: 28px !important;
      min-height: 28px !important;
      max-height: 28px !important;
      line-height: 1;

      .v-rating__wrapper,
      .v-rating__item {
        height: 24px;
        min-height: 24px;
      }

      .v-btn {
        width: 24px !important;
        height: 24px !important;
        min-width: 24px !important;
        min-height: 24px !important;
        padding: 0 !important;
      }

      .v-icon {
        font-size: 18px !important;
        width: 18px !important;
        height: 18px !important;
      }
    }

    .v-field {
      --v-input-control-height: 28px;
      align-items: center !important;
      min-height: 28px !important;
      height: 28px;
      overflow: visible;
    }

    // Accent-colored resting border; hover/focus states restated so they still win over it.
    .v-field__outline {
      --v-field-border-width: 1px;
      --v-field-border-opacity: 0.6;
      color: rgb(var(--v-theme-primary));
    }

    .v-field:hover .v-field__outline {
      --v-field-border-opacity: 0.87;
    }

    .v-field.v-field--focused .v-field__outline {
      --v-field-border-opacity: 1;
    }

    .v-field__field {
      display: flex;
      align-items: center;
      height: 100%;
      min-height: 0;
    }

    .v-field__input {
      display: flex;
      align-items: center;
      min-height: 28px !important;
      max-height: 28px !important;
      height: 28px !important;
      margin: 0 !important;
      padding-top: 0 !important;
      padding-bottom: 0 !important;
      padding-inline: 8px 0 !important;
      font-size: 0.8125rem;
      line-height: 1.2 !important;
    }

    .v-number-input {
      .v-btn {
        min-width: 28px;
        width: 28px;
        height: 28px;
      }
    }

    .v-field__prepend-inner,
    .v-field__append-inner,
    .v-field__clearable {
      padding-top: 0 !important;
      padding-bottom: 0 !important;
      margin: 0 !important;
      align-self: center !important;
      height: 28px;
      display: flex;
      align-items: center;
    }

    .v-field__append-inner {
      padding-inline-start: 0 !important;
    }

    .v-autocomplete__selection {
      margin-inline-end: 2px;
      max-width: none;
    }

    .v-autocomplete {
      .v-field__input {
        flex-wrap: nowrap !important;
        overflow: hidden !important;
        max-height: 28px !important;
        min-height: 28px !important;
        align-items: center !important;
        align-content: center !important;
      }
    }

    .v-chip {
      margin: 0 2px 0 0 !important;
      padding: 0 !important;
      min-height: 20px !important;
      height: 20px !important;
      font-size: 0.6875rem !important;
      flex: 0 0 auto;
      max-width: 120px;

      .v-chip__content {
        padding-inline: 5px !important;
        line-height: 1.2;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .v-chip__close {
        width: 12px !important;
        height: 12px !important;
        min-width: 12px !important;
        margin-inline: 0 2px !important;
        padding: 0 !important;
        color: currentColor !important;
        opacity: 1 !important;

        .v-icon {
          font-size: 10px !important;
          width: 10px !important;
          height: 10px !important;
          color: currentColor !important;
        }
      }
    }
  }

  .filter__actions {
    gap: 2px;
    align-items: center;
  }

  // Quick actions (invert / duplicate / clear) sit right after the value and show on hover.
  // A turned-off row has no value field to fill the line, so its controls are pushed to the right edge.
  .filter-form .filter.filter--muted .filter__row-actions {
    margin-left: auto;
  }

  // Items this condition matches on its own, so the narrowest one stands out.
  .filter-form .filter .filter__count {
    flex: 0 0 auto;
    min-width: 40px;
    text-align: right;
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    color: rgba(var(--v-theme-on-surface), 0.6);

    &--zero {
      color: rgb(var(--v-theme-error));
    }
  }

  .filter-form .filter .filter__restore {
    display: flex;
    align-items: center;
    flex: 0 0 auto;
  }

  .filter-form .filter .filter__row-actions {
    display: flex;
    align-items: center;
    flex: 0 0 auto;
    gap: 2px;
  }

  .filter__row-actions .v-btn.filter__row-action {
    width: 24px !important;
    height: 24px !important;
    min-width: 24px !important;
    padding: 0 !important;
    border-radius: 8px !important;
  }

  // Conditions as table rows: [switch] [icon + name] [condition] [value ...] [grip] [x].
  // The header wrappers dissolve so their children become items of the row.
  .filter-form .filter {
    .filter__header,
    .filter__title_block,
    .filter__actions {
      display: contents !important;
    }

    .filter__title_content {
      order: 1;
      flex: 0 1 150px;
      min-width: 110px;
    }

    .filter__cond {
      order: 2;
      flex: 0 0 auto;
    }

    .filter__body {
      order: 3;
      flex: 1 1 auto;
    }

    .filter__restore {
      order: 3;
    }

    .filter__count {
      order: 4;
    }

    .filter__row-actions {
      order: 5;
    }

    // Grip sits at the left edge of the row, tucked into its padding.
    .drag-handle {
      order: 0;
      width: 8px !important;
      min-width: 8px !important;
      margin-inline: -10px -2px;
      overflow: visible;

      .v-icon {
        font-size: 14px !important;
        width: 14px !important;
        flex: 0 0 14px;
      }
    }

    .filter__title_block > .v-btn:not(.drag-handle) {
      order: 8;
    }

    .filter__title_block > .filter__toggle {
      order: 7;
    }
  }

  // A condition that is turned off keeps its eye button visible so it can be turned back on.
  .filter-form .filter.filter--muted .filter__title_block > .filter__toggle {
    opacity: 1 !important;
  }

  // Remove / drag controls show on hover or keyboard focus (always on touch screens).
  @media (hover: hover) {
    .filter-form .filter:not(.removed) .drag-handle,
    .filter-form .filter:not(.removed) .filter__row-actions,
    .filter-form .filter:not(.removed) .filter__title_block > .v-btn:not(.drag-handle) {
      opacity: 0;
      transition: opacity 0.12s ease;
    }

    // The grip stays faintly visible so the row reads as draggable, and lights up on hover.
    .filter-form .filter:not(.removed) .drag-handle {
      opacity: 0.25;
    }

    .filter-form .filter:hover .drag-handle,
    .filter-form .filter:hover .filter__row-actions,
    .filter-form .filter:hover .filter__title_block > .v-btn:not(.drag-handle),
    .filter-form .filter:focus-within .drag-handle,
    .filter-form .filter:focus-within .filter__row-actions,
    .filter-form .filter:focus-within .filter__title_block > .v-btn:not(.drag-handle) {
      opacity: 1;
    }
  }

  .overline {
    padding: 16px 8px !important;
  }
}

</style>
