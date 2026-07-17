<template>
  <div class="edit-pinned-overview">
    <v-card class="edit-pinned-overview__block rounded-xl px-2" color="rgba(150, 150, 150, 0.09)" flat>
      <div class="text-medium-emphasis text-caption pt-2 mx-2">{{ t('editing.media_file_information') }}</div>
      <v-chip-group column class="px-2 mb-2 edit-pinned-overview__chips">
        <v-chip v-for="i in presetMeta" :key="i.name" size="small" :ripple="false" @click.prevent>
          <v-icon size="small" start>mdi-{{ i.icon }}</v-icon>
          <span class="mr-1">{{ i.text }}: </span>
          <span>{{ i.value || item[i.name] }}</span>
        </v-chip>
      </v-chip-group>
    </v-card>

    <v-card class="edit-pinned-overview__block rounded-xl px-2" color="rgba(150, 150, 150, 0.09)" variant="flat">
      <div class="text-medium-emphasis text-caption pt-2 mx-2">{{ t('editing.date_information') }}</div>
      <v-chip-group column class="px-2 mb-2 edit-pinned-overview__chips">
        <v-chip :title="getDateByKey('createdAt')" size="small" :ripple="false" @click.prevent>
          <v-icon start size="small">mdi-calendar-plus</v-icon>
          {{ t('editing.added') }}: {{ getDateAgoByKey('createdAt') }}
        </v-chip>
        <v-chip :title="getDateByKey('updatedAt')" size="small" :ripple="false" @click.prevent>
          <v-icon start size="small">mdi-calendar-edit</v-icon>
          {{ t('editing.last_edit') }}: {{ getDateAgoByKey('updatedAt') }}
        </v-chip>
        <v-chip :title="getDateByKey('viewedAt')" size="small" :ripple="false" @click.prevent>
          <v-icon start size="small">mdi-eye</v-icon>
          {{ t('editing.last_view') }}: {{ getDateAgoByKey('viewedAt') }}
        </v-chip>
      </v-chip-group>
    </v-card>

    <div v-if="isMedia" class="edit-pinned-overview__block">
      <FilePathEditing :media="item" @update="onMediaPathUpdate"/>
    </div>

    <v-card class="edit-pinned-overview__block rounded-xl" color="rgba(150, 150, 150, 0.09)" variant="flat">
      <div class="text-medium-emphasis text-caption pt-2 mx-4">{{ t('editing.progress_filling_data') }}</div>
      <div class="pa-4 pt-2">
        <v-progress-linear :model-value="completionStatus" color="primary" rounded/>
      </div>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {useSettingsStore} from '@/stores/settings'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/en'
import 'dayjs/locale/de'
import 'dayjs/locale/fr'
import 'dayjs/locale/ja'
import 'dayjs/locale/pt-br'
import 'dayjs/locale/es'
import 'dayjs/locale/zh-cn'
import 'dayjs/locale/ru'
import FilePathEditing from '@/components/items/FilePathEditing.vue'
import type {PresetMetaParam} from '@/types/itemsPage'
import type {MediaItem, Tag} from '@/types/stores'

const props = withDefaults(defineProps<{
  item: MediaItem | Tag
  isMedia?: boolean
  completionStatus?: number
  presetMeta?: PresetMetaParam[]
}>(), {
  isMedia: false,
  completionStatus: 0,
  presetMeta: () => [],
})

const emit = defineEmits<{
  'media-path-update': [media: MediaItem]
}>()

const onMediaPathUpdate = (media: MediaItem) => {
  emit('media-path-update', media)
}

const settingsStore = useSettingsStore()
const {t} = useI18n()

const locale = computed(() => settingsStore.locale == 'cn' ? 'zh-cn' : settingsStore.locale == 'pt' ? 'pt-br' : settingsStore.locale)
dayjs.extend(relativeTime)
dayjs.locale(locale.value)

const getDateByKey = (key: string) => {
  const date = props.item?.[key]
  if (date) {
    const dateObj = new Date(date as string | number | Date)
    return dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString()
  }
  return t('common.none')
}

const getDateAgoByKey = (key: string) => {
  const date = props.item?.[key]
  if (date) {
    return dayjs(date as string | number | Date).fromNow()
  }
  return t('common.never')
}
</script>
