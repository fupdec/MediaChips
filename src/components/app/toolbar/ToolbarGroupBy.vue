<template>
  <v-select
    :model-value="activeValue"
    @update:model-value="updateGroupBy"
    :items="groupedOptions"
    item-value="value"
    rounded="xl"
    variant="outlined"
    density="compact"
    min-width="200"
    :label="t('items.group_by')"
    class="mr-4"
    hide-details
    :disabled="!itemsStore.isFiltersLoaded"
  >
    <template #selection>
      <v-icon
        v-if="selectionIcon"
        :icon="`mdi-${selectionIcon}`"
        size="small"
      />
      <span class="pl-2 text-truncate">{{ selectionLabel }}</span>
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
            <span class="pl-4">{{ getOptionLabel(item.raw) }}</span>
          </div>
        </template>
      </v-list-item>
    </template>
  </v-select>
</template>

<script setup lang="ts">
import {computed, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useEventBus} from '@/utils/eventBus'
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

const itemsStore = useItemsStore()
const appStore = useAppStore()
const eventBus = useEventBus()
const {t} = useI18n()

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

const activeValue = computed(() =>
  serializeGroupBySetting(
    normalizeItemsGroupBy(itemsStore.groupBy),
    itemsStore.groupByMetaId,
  ),
)

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

function emitGroupBy(groupBy: ItemsGroupBy, metaId: number | null = null) {
  itemsStore.updateMultiple({
    groupBy,
    groupByMetaId: groupBy === 'pinnedMeta' ? metaId : null,
    groups: [],
  })
  eventBus.emit('setItemsGroupBy', serializeGroupBySetting(groupBy, metaId))
}

function updateGroupBy(val: string | null) {
  if (val == null) return
  const parsed = parseGroupBySetting(val)
  emitGroupBy(parsed.groupBy, parsed.metaId)
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
