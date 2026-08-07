<template>
  <div class="edit-pinned-overview">
    <div class="edit-pinned-overview__surface">
      <section class="edit-pinned-overview__section">
        <div class="edit-pinned-overview__label">
          {{ isMedia ? t('editing.media_file_information') : t('editing.tag_information') }}
        </div>
        <div class="edit-pinned-overview__stats">
          <span
            v-for="i in presetMeta"
            :key="i.name"
            class="edit-pinned-overview__stat"
          >
            <v-icon size="14">mdi-{{ i.icon }}</v-icon>
            <span class="edit-pinned-overview__stat-label">{{ i.text }}:</span>
            <span class="edit-pinned-overview__stat-value">{{ i.value || item[i.name] }}</span>
          </span>
        </div>
      </section>

      <section class="edit-pinned-overview__section">
        <div class="edit-pinned-overview__label">{{ t('editing.date_information') }}</div>
        <div class="edit-pinned-overview__stats">
          <span
            class="edit-pinned-overview__stat"
            :title="getDateByKey('createdAt')"
          >
            <v-icon size="14">mdi-calendar-plus</v-icon>
            <span class="edit-pinned-overview__stat-label">{{ t('editing.added') }}:</span>
            <span class="edit-pinned-overview__stat-value">{{ getDateAgoByKey('createdAt') }}</span>
          </span>
          <span
            class="edit-pinned-overview__stat"
            :title="getDateByKey('updatedAt')"
          >
            <v-icon size="14">mdi-calendar-edit</v-icon>
            <span class="edit-pinned-overview__stat-label">{{ t('editing.last_edit') }}:</span>
            <span class="edit-pinned-overview__stat-value">{{ getDateAgoByKey('updatedAt') }}</span>
          </span>
          <span
            class="edit-pinned-overview__stat"
            :title="getDateByKey('viewedAt')"
          >
            <v-icon size="14">mdi-eye</v-icon>
            <span class="edit-pinned-overview__stat-label">{{ t('editing.last_view') }}:</span>
            <span class="edit-pinned-overview__stat-value">{{ getDateAgoByKey('viewedAt') }}</span>
          </span>
        </div>
      </section>

      <section v-if="isMedia" class="edit-pinned-overview__section edit-pinned-overview__section--path">
        <FilePathEditing :media="item" compact @update="onMediaPathUpdate"/>
      </section>

      <section class="edit-pinned-overview__section edit-pinned-overview__section--progress">
        <div class="edit-pinned-overview__label">{{ t('editing.progress_filling_data') }}</div>
        <div class="edit-pinned-overview__progress">
          <v-progress-linear
            :model-value="completionStatus"
            color="primary"
            height="4"
            rounded
          />
          <span class="edit-pinned-overview__progress-value">{{ completionStatus }}%</span>
        </div>
      </section>
    </div>
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
