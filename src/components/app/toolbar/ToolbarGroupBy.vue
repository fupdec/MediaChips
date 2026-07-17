<template>
  <div class="d-flex align-end">
    <v-select
      :model-value="activeGroupBy"
      @update:model-value="updateGroupBy"
      :items="groupByOptions"
      item-value="val"
      rounded="xl"
      variant="outlined"
      density="compact"
      min-width="170"
      :label="t('items.group_by')"
      class="mr-2"
      hide-details
      :disabled="!itemsStore.isFiltersLoaded"
    >
      <template #selection>
        <v-icon
          :icon="`mdi-${selectionIcon}`"
          size="small"
        />
        <span class="pl-2">{{ selectionLabel }}</span>
      </template>
      <template #item="{ item, props: menuProps }">
        <v-list-item
          v-bind="menuProps"
          :title="undefined"
          :active="activeGroupBy === item.raw.val"
          color="primary"
          density="compact"
        >
          <template #title>
            <div class="text-body-2 py-1">
              <v-icon
                :icon="`mdi-${item.raw.icon}`"
                size="small"
              />
              <span class="pl-4">{{ t(item.raw.textKey) }}</span>
            </div>
          </template>
        </v-list-item>
      </template>
    </v-select>

    <v-select
      v-if="activeGroupBy === 'pinnedMeta'"
      :model-value="activeMetaId"
      @update:model-value="updatePinnedMetaId"
      :items="pinnedMetaOptions"
      item-value="id"
      item-title="name"
      rounded="xl"
      variant="outlined"
      density="compact"
      min-width="160"
      :label="t('items.group_by_pinned_meta_field')"
      class="mr-4"
      hide-details
      :disabled="!itemsStore.isFiltersLoaded || !pinnedMetaOptions.length"
    >
      <template #selection="{ item }">
        <span class="text-truncate">{{ item.title }}</span>
      </template>
    </v-select>
  </div>
</template>

<script setup lang="ts">
import {computed, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useEventBus} from '@/utils/eventBus'
import {getMetaName} from '@/utils/metaI18n'
import {getCurrentMediaType, isAudioMediaType, isImageMediaType, isVideoMediaType} from '@/utils/mediaType'
import {
  MEDIA_ONLY_GROUP_BY,
  normalizeItemsGroupBy,
  serializeGroupBySetting,
  type ItemsGroupBy,
} from '@/utils/itemsGroupBy'

const itemsStore = useItemsStore()
const appStore = useAppStore()
const eventBus = useEventBus()
const {t} = useI18n()

type GroupByOption = {
  val: ItemsGroupBy
  icon: string
  textKey: string
  mediaOnly?: boolean
  mediaTypes?: Array<'video' | 'audio' | 'image'>
}

const allGroupByOptions: GroupByOption[] = [
  {val: 'none', icon: 'format-list-bulleted', textKey: 'items.group_by_none'},
  {val: 'firstLetter', icon: 'alphabetical-variant', textKey: 'items.group_by_first_letter'},
  {val: 'dateDay', icon: 'calendar-today', textKey: 'items.group_by_date_day'},
  {val: 'dateMonth', icon: 'calendar-month', textKey: 'items.group_by_date_month'},
  {val: 'dateYear', icon: 'calendar', textKey: 'items.group_by_date_year'},
  {val: 'rating', icon: 'star', textKey: 'items.group_by_rating'},
  {val: 'favorite', icon: 'heart', textKey: 'items.group_by_favorite'},
  {val: 'views', icon: 'eye', textKey: 'items.group_by_views'},
  {val: 'pinnedMeta', icon: 'pin', textKey: 'items.group_by_pinned_meta'},
  {val: 'path', icon: 'folder', textKey: 'items.group_by_path', mediaOnly: true},
  {val: 'diskRoot', icon: 'harddisk', textKey: 'items.group_by_disk_root', mediaOnly: true},
  {val: 'ext', icon: 'file-outline', textKey: 'items.group_by_ext', mediaOnly: true},
  {val: 'filesize', icon: 'sd', textKey: 'items.group_by_filesize', mediaOnly: true},
  {
    val: 'duration',
    icon: 'clock-outline',
    textKey: 'items.group_by_duration',
    mediaOnly: true,
    mediaTypes: ['video', 'audio'],
  },
  {
    val: 'codec',
    icon: 'filmstrip',
    textKey: 'items.group_by_codec',
    mediaOnly: true,
    mediaTypes: ['video', 'audio'],
  },
  {
    val: 'fps',
    icon: 'speedometer',
    textKey: 'items.group_by_fps',
    mediaOnly: true,
    mediaTypes: ['video'],
  },
  {
    val: 'bitrate',
    icon: 'waveform',
    textKey: 'items.group_by_bitrate',
    mediaOnly: true,
    mediaTypes: ['video', 'audio'],
  },
  {
    val: 'resolution',
    icon: 'monitor-screenshot',
    textKey: 'items.group_by_resolution',
    mediaOnly: true,
    mediaTypes: ['video', 'image'],
  },
]

const currentMediaType = computed(() => {
  if (itemsStore.type !== 'media') return null
  return getCurrentMediaType(appStore.mediaTypes, itemsStore.environment?.media_type_id)
})

const groupByOptions = computed(() =>
  allGroupByOptions.filter((option) => {
    if (option.mediaOnly && itemsStore.type !== 'media') return false
    if (option.mediaTypes?.length) {
      const isVideo = isVideoMediaType(currentMediaType.value)
      const isAudio = isAudioMediaType(currentMediaType.value)
      const isImage = isImageMediaType(currentMediaType.value)
      if (option.mediaTypes.includes('video') && isVideo) return true
      if (option.mediaTypes.includes('audio') && isAudio) return true
      if (option.mediaTypes.includes('image') && isImage) return true
      return false
    }
    return true
  }),
)

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
        id,
        name: getMetaName(meta, t) || meta.name || String(id),
        type: String(meta.type || ''),
        icon: meta.icon || 'tag',
      }
    })
    .filter((row): row is {id: number; name: string; type: string; icon: string} => row != null)
})

const activeGroupBy = computed(() => normalizeItemsGroupBy(itemsStore.groupBy))

const activeMetaId = computed(() => {
  const stored = Number(itemsStore.groupByMetaId)
  if (Number.isFinite(stored) && pinnedMetaOptions.value.some((row) => row.id === stored)) {
    return stored
  }
  return pinnedMetaOptions.value[0]?.id ?? null
})

const selectionOption = computed(() =>
  groupByOptions.value.find((option) => option.val === activeGroupBy.value)
    || groupByOptions.value[0],
)

const selectionIcon = computed(() => selectionOption.value.icon)
const selectionLabel = computed(() => t(selectionOption.value.textKey))

function emitGroupBy(groupBy: ItemsGroupBy, metaId: number | null = null) {
  itemsStore.updateMultiple({
    groupBy,
    groupByMetaId: groupBy === 'pinnedMeta' ? metaId : null,
  })
  eventBus.emit('setItemsGroupBy', serializeGroupBySetting(groupBy, metaId))
}

function updateGroupBy(val: ItemsGroupBy | null) {
  if (val == null) return
  const groupBy = normalizeItemsGroupBy(val)
  if (groupBy === 'pinnedMeta') {
    emitGroupBy(groupBy, activeMetaId.value)
    return
  }
  emitGroupBy(groupBy, null)
}

function updatePinnedMetaId(metaId: number | null) {
  if (metaId == null) return
  emitGroupBy('pinnedMeta', Number(metaId))
}

watch(
  groupByOptions,
  (options) => {
    if (options.some((option) => option.val === activeGroupBy.value)) return
    if (
      MEDIA_ONLY_GROUP_BY.has(activeGroupBy.value)
      || activeGroupBy.value === 'duration'
      || activeGroupBy.value === 'pinnedMeta'
    ) {
      emitGroupBy('none')
    }
  },
)

watch(
  pinnedMetaOptions,
  (options) => {
    if (activeGroupBy.value !== 'pinnedMeta') return
    if (!options.length) {
      emitGroupBy('none')
      return
    }
    if (!options.some((row) => row.id === itemsStore.groupByMetaId)) {
      emitGroupBy('pinnedMeta', options[0].id)
    }
  },
)
</script>
