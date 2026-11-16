<template>
  <v-menu
    v-if="iconMode"
    v-model="menuOpen"
    :close-on-content-click="false"
    location="bottom"
  >
    <template #activator="{ props: activatorProps }">
      <v-btn
        v-bind="activatorProps"
        color="primary"
        variant="tonal"
        size="small"
        icon
        :disabled="!items.isFiltersLoaded"
        v-tooltip:top="selectionLabel"
      >
        <v-icon size="18">
          {{
            items.sortDir === 'asc'
              ? 'mdi-sort-ascending'
              : 'mdi-sort-descending'
          }}
        </v-icon>
      </v-btn>
    </template>

    <v-list
      density="compact"
      class="toolbar-sort-menu"
      max-height="360"
    >
      <v-list-item
        color="primary"
        density="compact"
        @click="toggleDir"
      >
        <template #prepend>
          <v-icon size="small">
            {{
              items.sortDir === 'asc'
                ? 'mdi-sort-ascending'
                : 'mdi-sort-descending'
            }}
          </v-icon>
        </template>
        <v-list-item-title>{{ t('filters.change_direction') }}</v-list-item-title>
      </v-list-item>

      <v-divider class="my-1"/>

      <template
        v-for="(item, index) in sortParamsGrouped"
        :key="index"
      >
        <v-list-subheader v-if="isSortGroupHeader(item)">
          {{ getGroupText(item.header) }}
        </v-list-subheader>

        <v-divider v-else-if="isSortGroupDivider(item)"/>

        <v-list-item
          v-else-if="isSortParamItem(item)"
          :active="isActiveSortParam(item)"
          color="primary"
          density="compact"
          @click="sortFromMenu(item.param)"
        >
          <template #title>
            <div class="text-body-2 py-1">
              <v-icon
                :icon="`mdi-${item.icon}`"
                size="small"
              />
              <span class="pl-4">{{ getSortParamText(item) }}</span>
            </div>
          </template>
          <template
            v-if="isActiveSortParam(item)"
            #append
          >
            <v-icon size="small">
              {{
                items.sortDir === 'asc'
                  ? 'mdi-sort-ascending'
                  : 'mdi-sort-descending'
              }}
            </v-icon>
          </template>
        </v-list-item>
      </template>
    </v-list>
  </v-menu>

  <v-autocomplete
    v-else
    :model-value="items.sortBy"
    @update:model-value="sort"
    v-model:search="search"
    :items="sortParamsGrouped"
    item-value="param"
    item-title="title"
    :custom-filter="filterSortItems"
    rounded="xl"
    variant="outlined"
    density="compact"
    min-width="200"
    :label="deck ? undefined : t('filters.sort_by')"
    :placeholder="deck ? t('filters.sort_by') : t('filters.select_parameter')"
    :aria-label="t('filters.sort_by')"
    :class="deck ? 'toolbar-sort--deck' : 'mx-4'"
    hide-details
    single-line
    auto-select-first
    :disabled="!items.isFiltersLoaded"
    @update:menu="onMenuToggle"
  >
    <!-- Direction lives inside the field: one control for "sort by X ↑/↓". -->
    <template #prepend-inner>
      <v-btn
        v-tooltip:top="t('filters.change_direction')"
        :aria-label="t('filters.change_direction')"
        class="toolbar-sort__dir"
        color="primary"
        variant="text"
        size="x-small"
        icon
        @mousedown.stop.prevent
        @click.stop="toggleDir"
      >
        <v-icon size="18">
          {{
            items.sortDir === 'asc'
              ? 'mdi-sort-ascending'
              : 'mdi-sort-descending'
          }}
        </v-icon>
      </v-btn>
    </template>
    <template v-slot:selection>
      <div class="toolbar-sort__selection">
        <v-icon
          v-if="selectionIcon"
          :icon="`mdi-${selectionIcon}`"
          size="small"
        />
        <span class="toolbar-sort__selection-label">{{ selectionLabel }}</span>
      </div>
    </template>
    <template v-slot:item="{ item, props: menuProps }">
      <template v-if="isSortGroupHeader(item.raw)">
        <v-list-subheader>{{ getGroupText(item.raw.header) }}</v-list-subheader>
      </template>

      <template v-else-if="isSortGroupDivider(item.raw)">
        <v-divider />
      </template>

      <v-list-item v-else
        v-bind="menuProps"
        :title="undefined"
        :active="isActiveSortParam(item.raw)"
        color="primary"
        density="compact">
        <template v-slot:title>
          <div class="text-body-2 py-1">
            <v-icon :icon="`mdi-${item.raw.icon}`"
              size="small"></v-icon>
            <span class="pl-4">
              <template
                v-for="(part, index) in highlightParts(getSortParamText(item.raw))"
                :key="index"
              >
                <mark
                  v-if="part.match"
                  class="toolbar-sort__match"
                >{{ part.text }}</mark>
                <template v-else>{{ part.text }}</template>
              </template>
            </span>
          </div>
        </template>
        <template v-if="isActiveSortParam(item.raw)" #append>
          <v-icon size="small">
            {{
              items.sortDir === 'asc'
                ? 'mdi-sort-ascending'
                : 'mdi-sort-descending'
            }}
          </v-icon>
        </template>
      </v-list-item>
    </template>
  </v-autocomplete>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useDisplay} from 'vuetify'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useItemsPageCommands} from '@/composable/itemsPageCommands'
import {getCurrentMediaType, matchesMediaTypeFilter} from '@/utils/mediaType'
import {
  buildGroupedSortItems,
  getAllSortParams,
  getSortParamLabel,
  isSortGroupDivider,
  isSortGroupHeader,
  isSortParamItem,
} from '@/utils/mediaSortFilter'

const props = defineProps({
  deck: {
    type: Boolean,
    default: false,
  },
})

const itemsStore = useItemsStore()
const appStore = useAppStore()
const pageCommands = useItemsPageCommands()
const {t} = useI18n()
const {smAndDown} = useDisplay()
const search = ref('')
const menuOpen = ref(false)

const items = computed(() => itemsStore)
const env = computed(() => itemsStore.environment)
const iconMode = computed(() => props.deck && smAndDown.value)

const currentMediaType = computed(() =>
  getCurrentMediaType(appStore.mediaTypes, env.value.media_type_id),
)

const itemsType = computed(() => items.value.type as 'media' | 'tag')

const sortParams = computed(() => {
  return getAllSortParams(
    itemsType.value,
    currentMediaType.value,
    items.value.safeAssigned,
  ).filter((param) =>
    param.types.includes(itemsType.value) &&
    (!('media_types' in param) || matchesMediaTypeFilter(param, currentMediaType.value))
  )
})

const sortParamsGrouped = computed(() =>
  buildGroupedSortItems(sortParams.value, itemsType.value, currentMediaType.value).map((item) => {
    if (isSortParamItem(item)) {
      return {
        ...item,
        title: getSortParamLabel(item, t),
      }
    }
    if (isSortGroupHeader(item)) {
      return {
        ...item,
        title: getGroupText(item.header),
        param: `header:${item.header}`,
      }
    }
    return {
      ...item,
      title: '',
      param: 'divider',
    }
  }),
)

const getGroupText = (group?: string) =>
  t(`filters.groups.${group}`, group || '')

const getSortParamText = (raw: unknown) =>
  isSortParamItem(raw) ? getSortParamLabel(raw, t) : ''

const selectionLabel = computed(() => {
  const current = sortParams.value.find((param) => String(param.param) === String(items.value.sortBy))
  if (!current) return t('filters.sort_by')
  return getSortParamLabel(current, t) || t('filters.sort_by')
})

const selectionIcon = computed(() => {
  const current = sortParams.value.find((param) => String(param.param) === String(items.value.sortBy))
  return current?.icon || ''
})

const isActiveSortParam = (raw: unknown) =>
  isSortParamItem(raw) && String(raw.param) === String(items.value.sortBy)

const normalizeSortBy = () => {
  if (!items.value.isFiltersLoaded) return

  const allowed = sortParams.value.map((param) => String(param.param))
  const currentSortBy = items.value.sortBy == null ? '' : String(items.value.sortBy)

  if (currentSortBy && currentSortBy !== 'shuffle' && !allowed.includes(currentSortBy)) {
    const fallback = allowed.includes('createdAt') ? 'createdAt' : allowed[0]
    if (fallback && fallback !== currentSortBy) {
      itemsStore.setSortBy(fallback)
      pageCommands.setSortBy(fallback)
    }
  }
}

watch(sortParams, normalizeSortBy)
watch(() => items.value.isFiltersLoaded, normalizeSortBy)

function filterSortItems(
  _itemTitle: string,
  queryText: string,
  item?: {raw: unknown},
): boolean {
  const query = String(queryText || '').trim().toLowerCase()
  if (!query) return true
  if (!item) return false

  const raw = item.raw
  if (isSortGroupHeader(raw) || isSortGroupDivider(raw)) return false
  if (!isSortParamItem(raw)) return false

  const label = getSortParamLabel(raw, t).toLowerCase()
  const param = String(raw.param).toLowerCase()
  return label.includes(query) || param.includes(query)
}

function highlightParts(text: string): Array<{text: string; match: boolean}> {
  const query = String(search.value || '').trim()
  if (!query || !text) return [{text, match: false}]

  const source = String(text)
  const lowerSource = source.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const parts: Array<{text: string; match: boolean}> = []
  let cursor = 0

  while (cursor < source.length) {
    const index = lowerSource.indexOf(lowerQuery, cursor)
    if (index < 0) {
      parts.push({text: source.slice(cursor), match: false})
      break
    }
    if (index > cursor) {
      parts.push({text: source.slice(cursor, index), match: false})
    }
    parts.push({
      text: source.slice(index, index + query.length),
      match: true,
    })
    cursor = index + query.length
  }

  return parts.length ? parts : [{text: source, match: false}]
}

function onMenuToggle(open: boolean) {
  if (open) search.value = ''
}

function toggleDir() {
  const dir = items.value.sortDir === 'asc' ? 'desc' : 'asc'
  itemsStore.setSortDir(dir)
  pageCommands.setSortDir(dir)
}

function sort(param: string | number) {
  const nextSortBy = String(param)
  if (nextSortBy.startsWith('header:') || nextSortBy === 'divider') return

  if (String(items.value.sortBy) === nextSortBy) {
    toggleDir()
    return
  }

  itemsStore.setSortBy(nextSortBy)
  pageCommands.setSortBy(nextSortBy)
}

function sortFromMenu(param: string | number) {
  sort(param)
  menuOpen.value = false
}
</script>

<style scoped lang="scss">
:deep(.v-input__prepend) {
  margin-inline-end: 4px;
}

.toolbar-sort__dir {
  margin-inline: -4px 2px;
}

:deep(.v-field__prepend-inner) {
  align-self: center;
  padding-top: 0;
  padding-inline-end: 6px;
  margin-inline-end: 2px;
  border-inline-end: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.toolbar-sort__selection {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.toolbar-sort__selection-label {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.toolbar-sort__match {
  padding: 0;
  background: rgba(var(--v-theme-primary), 0.22);
  color: inherit;
  border-radius: 2px;
}

.toolbar-sort-menu {
  min-width: 220px;
}

.toolbar-sort--deck {
  margin-inline: 0 !important;

  :deep(.v-field) {
    --v-input-control-height: 40px;
  }

  /* Left inset = top/bottom inset around the 28px direction button: (40 - 28) / 2 = 6px. */
  :deep(.v-field--prepended) {
    padding-inline-start: 6px;
  }

  :deep(.v-field__input) {
    min-height: 40px !important;
    max-height: 40px;
    flex-wrap: nowrap !important;
    overflow: hidden;
    padding-top: 0 !important;
    padding-bottom: 0 !important;
    padding-inline: 10px 6px !important;
    align-items: center;
    font-size: 0.75rem !important;
    line-height: 1.2 !important;
  }

  /* Direction button | divider | label: consistent 6/10px paddings. */
  :deep(.v-field__prepend-inner) {
    position: relative;
    align-items: center;
    align-self: center;
    padding-block: 0;
    padding-inline: 0 10px;
    margin-inline-end: 0;
    border-inline-end: 0;

    &::after {
      content: '';
      position: absolute;
      inset-inline-end: 0;
      top: 50%;
      width: 1px;
      height: 20px;
      transform: translateY(-50%);
      background: rgba(var(--v-theme-on-surface), 0.12);
    }
  }

  .toolbar-sort__dir {
    width: 28px;
    height: 28px;
    margin: 0;
  }

  :deep(.v-field__append-inner) {
    padding-block: 0;
    padding-inline: 0 6px;
    align-self: center;
  }

  :deep(.v-field__append-inner .v-icon) {
    font-size: 16px !important;
  }

  :deep(.v-autocomplete__selection) {
    margin-inline: 0;
    max-width: 100%;
    overflow: hidden;
    font-size: 0.75rem;
    line-height: 1.2;
  }

  :deep(.v-input__prepend) {
    margin-inline-end: 4px;
    align-self: center;
  }

  :deep(.v-input__prepend .v-btn) {
    width: 40px !important;
    height: 40px !important;
  }

  .toolbar-sort__selection {
    gap: 8px;
    max-width: 100%;
  }
}
</style>
