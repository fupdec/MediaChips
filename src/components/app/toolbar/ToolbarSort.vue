<template>
  <v-autocomplete
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
    <template #prepend>
      <v-btn
        v-tooltip:top="t('filters.change_direction')"
        color="primary"
        variant="tonal"
        size="small"
        icon
        @click="toggleDir"
      >
        <v-icon>
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

<!--  <v-card v-show="false"-->
<!--    rounded="xl"-->
<!--    variant="tonal"-->
<!--    color="primary"-->
<!--  >-->
<!--    <v-overlay-->
<!--      :model-value="!items.isFiltersLoaded"-->
<!--      :opacity="0.1"-->
<!--      contained-->
<!--      persistent-->
<!--      class="d-flex justify-center align-center"-->
<!--    >-->
<!--      <v-progress-circular indeterminate-->
<!--        size="100"-->
<!--        width="10"-->
<!--        color="primary"/>-->
<!--    </v-overlay>-->

<!--    &lt;!&ndash; HEADER &ndash;&gt;-->
<!--    <v-card-title class="d-flex align-center">-->
<!--      <span class="text-h5">-->
<!--        Sort by-->
<!--      </span>-->

<!--      <v-btn-->
<!--        class="ml-4"-->
<!--        color="primary"-->
<!--        variant="tonal"-->
<!--        rounded-->
<!--        @click="toggleDir"-->
<!--      >-->
<!--        <v-icon start>-->
<!--          {{-->
<!--            items.sortDir === 'asc'-->
<!--              ? 'mdi-sort-ascending'-->
<!--              : 'mdi-sort-descending'-->
<!--          }}-->
<!--        </v-icon>-->
<!--        Change direction-->
<!--      </v-btn>-->

<!--      <v-spacer/>-->

<!--      <v-btn-->
<!--        icon-->
<!--        variant="text"-->
<!--        @click="toolbarStore.sort.show = false"-->
<!--      >-->
<!--        <v-icon>mdi-close</v-icon>-->
<!--      </v-btn>-->
<!--    </v-card-title>-->

<!--    &lt;!&ndash; CONTENT &ndash;&gt;-->
<!--    <v-card-text>-->
<!--      <v-chip-group column-->
<!--        class="pb-0">-->
<!--        <v-chip-->
<!--          v-for="param in sortParams"-->
<!--          :key="param.param"-->
<!--          class="ma-1"-->
<!--          base-color="primary"-->
<!--          :variant="param.param === items.sortBy ? 'flat' : 'outlined'"-->
<!--          @click="sort(param.param)"-->
<!--        >-->
<!--          <v-icon start>-->
<!--            {{ `mdi-${param.icon}` }}-->
<!--          </v-icon>-->

<!--          <span v-html="param.text"></span>-->

<!--          <v-icon v-if="param.param === items.sortBy"-->
<!--            end>-->
<!--            {{-->
<!--              items.sortDir === 'asc'-->
<!--                ? 'mdi-sort-ascending'-->
<!--                : 'mdi-sort-descending'-->
<!--            }}-->
<!--          </v-icon>-->
<!--        </v-chip>-->
<!--      </v-chip-group>-->
<!--    </v-card-text>-->
<!--  </v-card>-->
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
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

defineProps({
  deck: {
    type: Boolean,
    default: false,
  },
})

/* ================= STORES ================= */

const itemsStore = useItemsStore()
const appStore = useAppStore()
const pageCommands = useItemsPageCommands()
const {t} = useI18n()
const search = ref('')

/* ================= COMPUTED ================= */

const items = computed(() => itemsStore)
const env = computed(() => itemsStore.environment)

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

/* ================= METHODS ================= */

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
</script>

<style scoped lang="scss">
:deep(.v-input__prepend) {
  margin-inline-end: 4px;
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

.toolbar-sort--deck {
  margin-inline: 0 !important;

  :deep(.v-field) {
    --v-input-control-height: 40px;
  }

  :deep(.v-field__input) {
    min-height: 40px !important;
    max-height: 40px;
    flex-wrap: nowrap !important;
    overflow: hidden;
    padding-top: 0 !important;
    padding-bottom: 0 !important;
    padding-inline: 12px 8px !important;
    align-items: center;
    font-size: 0.75rem !important;
    line-height: 1.2 !important;
  }

  :deep(.v-field__append-inner) {
    padding-top: 0;
    padding-inline-start: 0;
    align-self: center;
  }

  :deep(.v-field__append-inner .v-icon) {
    font-size: 16px !important;
  }

  :deep(.v-autocomplete__selection) {
    margin-inline-end: 0;
    margin-inline-start: 2px;
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
    gap: 4px;
  }

  .toolbar-sort__selection .v-icon {
    font-size: 14px !important;
    width: 14px;
    height: 14px;
  }

  .toolbar-sort__selection-label {
    font-size: 0.75rem;
    line-height: 1.2;
  }
}
</style>
