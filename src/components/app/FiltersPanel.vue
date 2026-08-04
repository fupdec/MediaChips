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
      <LocalAiAssistPanel
        v-if="LOCAL_AI_UI_ENABLED"
        class="mb-3"
        mode="filter"
        :prompt="filterAiPrompt"
        :context="filterAiContext"
      />

      <!-- Top / full mode: one compact toolbar row -->
      <div
        v-if="variant === 'top' && (editMode || filters.length === 0)"
        class="filters-panel__toolbar-row"
      >
        <v-btn
          v-if="editMode"
          variant="tonal"
          rounded="xl"
          size="small"
          color="primary"
          class="filters-panel__toolbar-btn"
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

        <v-menu
          v-if="editMode && itemsType === 'media'"
          location="bottom"
        >
          <template #activator="{ props: menuProps }">
            <v-btn
              v-bind="menuProps"
              variant="tonal"
              rounded="xl"
              size="small"
              color="primary"
              class="filters-panel__toolbar-btn"
            >
              <v-icon
                start
                size="small"
              >
                mdi-content-duplicate
              </v-icon>
              <span class="text-truncate">{{ duplicatesMenuLabel }}</span>
              <v-icon
                end
                size="small"
              >
                mdi-menu-down
              </v-icon>
            </v-btn>
          </template>
          <v-list
            density="compact"
            nav
          >
            <v-list-item
              v-if="findDuplicatesActive"
              :title="t('filters.duplicates_menu_off')"
              @click="emit('clear-duplicates')"
            />
            <v-divider
              v-if="findDuplicatesActive"
              class="my-1"
            />
            <v-list-item
              v-for="mode in duplicateMenuModes"
              :key="mode.value"
              :title="t(mode.labelKey)"
              :active="findDuplicatesActive && isDuplicateModeActive(mode.value)"
              @click="emit('find-duplicates', mode.value)"
            />
          </v-list>
        </v-menu>

        <FiltersAdd
          v-if="isReady && (editMode || filters.length === 0)"
          class="filters-panel__add"
          hide-floating-label
          :params="listBy"
          @add="emit('add', $event)"
        />
      </div>

      <!-- Drawer / classic stacked toolbar -->
      <template v-else-if="variant !== 'top'">
        <div
          class="d-flex align-center mb-2 ga-2 filters-panel__actions"
          :class="editMode ? 'justify-space-between' : ''"
        >
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

        <v-menu
          v-if="editMode && itemsType === 'media'"
          location="bottom"
        >
          <template #activator="{ props: menuProps }">
            <v-btn
              v-bind="menuProps"
              class="mb-2"
              variant="tonal"
              rounded="xl"
              size="small"
              color="primary"
            >
              <v-icon
                start
                size="small"
              >
                mdi-content-duplicate
              </v-icon>
              {{ duplicatesMenuLabel }}
              <v-icon
                end
                size="small"
              >
                mdi-menu-down
              </v-icon>
            </v-btn>
          </template>
          <v-list
            density="compact"
            nav
          >
            <v-list-item
              v-if="findDuplicatesActive"
              :title="t('filters.duplicates_menu_off')"
              @click="emit('clear-duplicates')"
            />
            <v-divider
              v-if="findDuplicatesActive"
              class="my-1"
            />
            <v-list-item
              v-for="mode in duplicateMenuModes"
              :key="mode.value"
              :title="t(mode.labelKey)"
              :active="findDuplicatesActive && isDuplicateModeActive(mode.value)"
              @click="emit('find-duplicates', mode.value)"
            />
          </v-list>
        </v-menu>

        <FiltersAdd
          v-if="isReady && (editMode || filters.length === 0)"
          class="my-2"
          :params="listBy"
          @add="emit('add', $event)"
        />
      </template>
    </div>

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
          @pick-date="emit('pick-date', i)"
          @valid="emit('valid', $event)"
        />
      </template>

      <div
        v-else
        class="text-center py-6 overline"
      >
        <v-img
          src="/images/filters/filters-none.svg"
          class="my-4"
          contain
        />
        <div>{{ t('filters.no_filters') }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {defineAsyncComponent} from 'vue'
import {useI18n} from 'vue-i18n'
import FilterRow from '@/components/app/FilterRow.vue'
import FiltersAdd from '@/components/dialogs/filters/FiltersAdd.vue'
import LocalAiAssistPanel from '@/components/regex/LocalAiAssistPanel.vue'
import {LOCAL_AI_UI_ENABLED} from '@shared/features'
import type {FilterObject, FilterListParam} from '@/types/common'

const Draggable = defineAsyncComponent(() => import('vuedraggable'))

export type DuplicateMenuMode = {
  value: string
  labelKey: string
}

const props = withDefaults(defineProps<{
  variant?: 'drawer' | 'embedded' | 'top'
  hideHeader?: boolean
  editMode: boolean
  filters: FilterObject[]
  listBy: FilterListParam[]
  isReady?: boolean
  isFiltersChanged?: boolean
  itemsType?: string
  findDuplicatesActive?: boolean
  duplicatesMenuLabel: string
  duplicateMenuModes: DuplicateMenuMode[]
  isDuplicateModeActive: (mode: string) => boolean
  filterAiPrompt: string
  filterAiContext: Record<string, unknown>
  dragOptions: Record<string, unknown>
}>(), {
  variant: 'drawer',
  hideHeader: false,
  isReady: false,
  isFiltersChanged: false,
  itemsType: 'media',
  findDuplicatesActive: false,
})

const emit = defineEmits([
  'update:editMode',
  'update:filters',
  'close',
  'apply',
  'add',
  'reorder',
  'open-saved',
  'clear-duplicates',
  'find-duplicates',
  'set-by',
  'set-condition',
  'set-value',
  'set-active',
  'remove',
  'pick-date',
  'valid',
])

const {t} = useI18n()

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

  .filters-panel__toolbar-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 8px;
    padding: 6px 8px;
    border-radius: 12px;
    background: rgba(var(--v-theme-primary), 0.04);
    border: 1px solid rgba(var(--v-theme-primary), 0.1);
  }

  .filters-panel__toolbar-btn {
    flex: 0 0 auto;
    max-width: 220px;
    height: 28px !important;
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

    :deep(.v-field) {
      --v-input-control-height: 28px;
      border-radius: 999px !important;
      font-size: 0.75rem;
    }

    :deep(.v-field__input) {
      min-height: 28px !important;
      max-height: 28px !important;
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
      width: 28px !important;
      height: 28px !important;
      min-width: 28px !important;
      min-height: 28px !important;
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
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 6px;
    padding: 0;
    max-height: min(28vh, 240px);
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
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 6px;
    align-content: start;
    align-items: start;
  }

  .filter-form {
    min-width: 0;
    width: 100%;
    height: auto;
  }

  .filter-form .filter {
    margin-bottom: 0 !important;
    width: 100%;
    max-width: none;
    height: auto;
    min-height: 36px;
    border-radius: 16px !important;
    padding: 4px 8px 4px 6px !important;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: rgba(var(--v-theme-primary), 0.04) !important;
    border: 1px solid transparent;

    &.active {
      background: rgba(var(--v-theme-primary), 0.08) !important;
      border-color: rgba(var(--v-theme-primary), 0.18);
    }
  }

  .filter__header {
    gap: 4px;
    min-height: 28px;
    padding: 0 !important;
    margin: 0 !important;
    align-items: center;

    .v-btn {
      width: 24px !important;
      height: 24px !important;
      min-width: 24px !important;
      padding: 0 !important;

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

  .filter__cond {
    max-width: 52px;
    min-width: 44px;
    margin: 0 !important;
    padding: 0 !important;

    .v-field {
      --v-input-control-height: 28px;
    }

    .v-field__input {
      min-height: 28px !important;
      padding-top: 0 !important;
      padding-bottom: 0 !important;
      font-size: 0.75rem;
    }
  }

  .filter__switch {
    transform: scale(0.72);
    transform-origin: center right;
    margin: 0 !important;
    padding: 0 !important;

    .v-selection-control {
      min-height: 28px;
    }
  }

  .filter__body {
    padding: 0 !important;
    margin: 0 !important;
    width: 100%;

    .pa-1 {
      padding-right: 0 !important;
    }

    .v-input,
    .v-text-field,
    .v-rating {
      margin: 0 !important;
      padding: 0 !important;
      width: 100%;
    }

    .v-field {
      --v-input-control-height: 28px;
    }

    .v-field__input {
      min-height: 28px !important;
      padding-top: 0 !important;
      padding-bottom: 0 !important;
      padding-inline: 6px 0 !important;
      font-size: 0.8125rem;
    }

    .v-field__append-inner {
      padding-top: 0 !important;
      padding-inline-start: 0 !important;
      align-self: center;
    }

    .v-autocomplete__selection {
      margin-inline-end: 0;
    }

    .v-chip {
      margin: 1px 2px !important;
      padding: 0 !important;
      min-height: 20px !important;
      height: 20px !important;
      font-size: 0.6875rem !important;

      .v-chip__content {
        padding-inline: 5px !important;
        line-height: 1.2;
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

  .overline {
    padding: 16px 8px !important;
  }
}

</style>
