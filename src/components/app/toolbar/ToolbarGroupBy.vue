<template>
  <v-menu
    v-if="compact && isOff"
    v-model="menuOpen"
    :close-on-content-click="true"
    location="bottom"
  >
    <template #activator="{ props: activatorProps }">
      <v-btn
        v-bind="activatorProps"
        color="primary"
        variant="tonal"
        size="small"
        icon
        :disabled="!itemsStore.isFiltersLoaded"
        v-tooltip:top="t('items.group_by')"
      >
        <v-icon size="18">mdi-{{ selectionIcon }}</v-icon>
      </v-btn>
    </template>

    <v-list
      density="compact"
      class="toolbar-group-by-menu"
      max-height="360"
    >
      <template
        v-for="(item, index) in groupedOptions"
        :key="index"
      >
        <v-list-subheader v-if="isGroupByGroupHeader(item)">
          {{ getGroupText(item.header) }}
        </v-list-subheader>

        <v-divider v-else-if="isGroupByGroupDivider(item)" />

        <v-list-item
          v-else-if="isGroupByMenuOption(item)"
          :active="activeValue === item.value"
          color="primary"
          density="compact"
          @click="updateGroupBy(item.value)"
        >
          <template #title>
            <div class="text-body-2 py-1">
              <v-icon
                :icon="`mdi-${item.icon}`"
                size="small"
              />
              <span class="pl-4">{{ getOptionLabel(item) }}</span>
            </div>
          </template>
        </v-list-item>
      </template>
    </v-list>
  </v-menu>

  <v-autocomplete
    v-else
    :model-value="activeValue"
    @update:model-value="updateGroupBy"
    v-model:search="search"
    :items="groupedOptionsForMenu"
    item-value="value"
    item-title="title"
    :custom-filter="filterGroupByItems"
    rounded="xl"
    variant="outlined"
    density="compact"
    min-width="200"
    :label="compact ? undefined : t('items.group_by')"
    :placeholder="compact ? t('items.group_by') : undefined"
    :aria-label="t('items.group_by')"
    hide-details
    single-line
    auto-select-first
    :disabled="!itemsStore.isFiltersLoaded"
    :class="[
      'toolbar-group-by-select',
      {'toolbar-group-by-select--deck': compact},
    ]"
    @update:menu="onMenuToggle"
  >
    <template #selection>
      <div class="toolbar-group-by__selection">
        <v-icon
          v-if="selectionIcon"
          :icon="`mdi-${selectionIcon}`"
          size="small"
        />
        <span class="toolbar-group-by__selection-label">{{ selectionLabel }}</span>
      </div>
    </template>
    <template #item="{ item, props: menuProps }">
      <template v-if="isGroupByGroupHeader(item.raw)">
        <v-list-subheader>{{ getGroupText(item.raw.header) }}</v-list-subheader>
      </template>

      <template v-else-if="isGroupByGroupDivider(item.raw)">
        <v-divider />
      </template>

      <v-list-item
        v-else-if="isGroupByMenuOption(item.raw)"
        v-bind="menuProps"
        :title="undefined"
        :active="activeValue === item.raw.value"
        color="primary"
        density="compact"
      >
        <template #title>
          <div class="text-body-2 py-1">
            <v-icon
              :icon="`mdi-${item.raw.icon}`"
              size="small"
            />
            <span class="pl-4">
              <template
                v-for="(part, index) in highlightParts(getOptionLabel(item.raw))"
                :key="index"
              >
                <mark
                  v-if="part.match"
                  class="toolbar-group-by__match"
                >{{ part.text }}</mark>
                <template v-else>{{ part.text }}</template>
              </template>
            </span>
          </div>
        </template>
      </v-list-item>
    </template>
  </v-autocomplete>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useItemsPageCommands} from '@/composable/itemsPageCommands'
import {getMetaName} from '@/utils/metaI18n'
import {getCurrentMediaType} from '@/utils/mediaType'
import {
  normalizeItemsGroupBy,
  parseGroupBySetting,
  serializeGroupBySetting,
  type ItemsGroupBy,
} from '@/utils/itemsGroupBy'
import {
  BASE_GROUP_BY_OPTIONS,
  buildGroupedGroupByItems,
  filterGroupByOptions,
  isGroupByGroupDivider,
  isGroupByGroupHeader,
  isGroupByMenuOption,
  type GroupByMenuOption,
} from '@/utils/itemsGroupByMenu'

defineProps({
  compact: {
    type: Boolean,
    default: false,
  },
})

const itemsStore = useItemsStore()
const appStore = useAppStore()
const pageCommands = useItemsPageCommands()
const {t} = useI18n()

const menuOpen = ref(false)
const search = ref('')

const currentMediaType = computed(() => {
  if (itemsStore.type !== 'media') return null
  return getCurrentMediaType(appStore.mediaTypes, itemsStore.environment?.media_type_id)
})

const pinnedMetaOptions = computed(() => {
  const usePinnedMetaId = itemsStore.type === 'tag'
  const seen = new Set<number>()

  return itemsStore.sortedAssigned
    .map((row) => {
      const meta = row.meta
      const id = Number(
        usePinnedMetaId
          ? (row.pinnedMetaId ?? meta?.id)
          : (row.metaId ?? meta?.id),
      )
      if (!Number.isFinite(id) || !meta || seen.has(id)) return null
      seen.add(id)
      return {
        groupBy: 'pinnedMeta' as const,
        metaId: id,
        icon: meta.icon || 'tag',
        label: getMetaName(meta, t) || meta.name || String(id),
      }
    })
    .filter((row): row is {
      groupBy: 'pinnedMeta'
      metaId: number
      icon: string
      label: string
    } => row != null)
})

const flatOptions = computed(() =>
  filterGroupByOptions(
    [...BASE_GROUP_BY_OPTIONS, ...pinnedMetaOptions.value],
    itemsStore.type,
    currentMediaType.value,
  ),
)

const groupedOptions = computed(() => buildGroupedGroupByItems(flatOptions.value))

const groupedOptionsForMenu = computed(() =>
  groupedOptions.value.map((item) => {
    if (isGroupByMenuOption(item)) {
      return {
        ...item,
        title: getOptionLabel(item),
      }
    }
    if (isGroupByGroupHeader(item)) {
      return {
        ...item,
        title: getGroupText(item.header),
        value: `header:${item.header}`,
      }
    }
    return {
      ...item,
      title: '',
      value: 'divider',
    }
  }),
)

const activeValue = computed(() =>
  serializeGroupBySetting(
    normalizeItemsGroupBy(itemsStore.groupBy),
    itemsStore.groupByMetaId,
  ),
)

const isOff = computed(() => activeValue.value === 'none')

const activeOption = computed(() =>
  flatOptions.value.find((option) => option.value === activeValue.value)
    || flatOptions.value[0],
)

const selectionIcon = computed(() => activeOption.value?.icon || 'format-list-bulleted')
const selectionLabel = computed(() =>
  activeOption.value ? getOptionLabel(activeOption.value) : t('items.group_by'),
)

const getGroupText = (group?: string) =>
  t(`filters.groups.${group}`, group || '')

function getOptionLabel(option: GroupByMenuOption) {
  if (option.label) return option.label
  if (option.textKey) return t(option.textKey)
  return option.value
}

function filterGroupByItems(
  _itemTitle: string,
  queryText: string,
  item?: {raw: unknown},
): boolean {
  const query = String(queryText || '').trim().toLowerCase()
  if (!query) return true
  if (!item) return false

  const raw = item.raw
  if (isGroupByGroupHeader(raw) || isGroupByGroupDivider(raw)) return false
  if (!isGroupByMenuOption(raw)) return false

  const label = getOptionLabel(raw).toLowerCase()
  const value = String(raw.value).toLowerCase()
  return label.includes(query) || value.includes(query)
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

function emitGroupBy(groupBy: ItemsGroupBy, metaId: number | null = null) {
  itemsStore.updateMultiple({
    groupBy,
    groupByMetaId: groupBy === 'pinnedMeta' ? metaId : null,
    groups: [],
  })
  pageCommands.setGroupBy(serializeGroupBySetting(groupBy, metaId))
}

function updateGroupBy(val: string | null) {
  if (val == null) return
  if (val.startsWith('header:') || val === 'divider') return
  const parsed = parseGroupBySetting(val)
  emitGroupBy(parsed.groupBy, parsed.metaId)
  menuOpen.value = false
}

watch(
  flatOptions,
  (options) => {
    if (!itemsStore.isFiltersLoaded) return
    if (!options.length) return
    if (activeValue.value === 'none') return
    if (options.some((option) => option.value === activeValue.value)) return

    // Only clear when the active mode is invalid for this page type / media type.
    const active = normalizeItemsGroupBy(itemsStore.groupBy)
    const stillSupported = options.some((option) => option.groupBy === active)
    if (!stillSupported) {
      emitGroupBy('none')
      return
    }

    // Pinned meta id went stale — jump to the first available pinned meta.
    if (active === 'pinnedMeta') {
      const pinned = options.find((option) => option.groupBy === 'pinnedMeta')
      if (pinned?.metaId != null) emitGroupBy('pinnedMeta', pinned.metaId)
      else emitGroupBy('none')
    }
  },
)
</script>

<style scoped lang="scss">
.toolbar-group-by__selection {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.toolbar-group-by__selection-label {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.toolbar-group-by__match {
  padding: 0;
  background: rgba(var(--v-theme-primary), 0.22);
  color: inherit;
  border-radius: 2px;
}

.toolbar-group-by-select--deck {
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

  .toolbar-group-by__selection {
    gap: 4px;
  }

  .toolbar-group-by__selection .v-icon {
    font-size: 14px !important;
    width: 14px;
    height: 14px;
  }

  .toolbar-group-by__selection-label {
    font-size: 0.75rem;
    line-height: 1.2;
  }
}
</style>
