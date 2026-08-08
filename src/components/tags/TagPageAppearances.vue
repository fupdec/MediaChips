<template>
  <div class="tag-appearances mt-4">
    <div class="tag-appearances__actions d-flex align-center ga-2 flex-wrap mb-3">
      <v-btn
        color="primary"
        rounded
        variant="flat"
        :loading="playing"
        :disabled="appearanceCount === 0 || playing"
        @click="playAppearances('time')"
      >
        <v-icon start>mdi-face-recognition</v-icon>
        {{ t('tags.play_appearances', {count: appearanceCount}) }}
      </v-btn>
      <v-menu>
        <template #activator="{ props: menuProps }">
          <v-btn
            v-bind="menuProps"
            color="primary"
            rounded
            variant="tonal"
            icon
            :disabled="appearanceCount === 0 || playing"
          >
            <v-icon>mdi-menu-down</v-icon>
          </v-btn>
        </template>
        <v-list density="compact">
          <v-list-item
            :title="t('tags.play_appearances_in_order')"
            prepend-icon="mdi-sort-clock-ascending-outline"
            @click="playAppearances('time')"
          />
          <v-list-item
            :title="t('tags.play_appearances_shuffle')"
            prepend-icon="mdi-shuffle-variant"
            @click="playAppearances('shuffle')"
          />
        </v-list>
      </v-menu>
    </div>

    <div class="tag-appearances__header d-flex align-center justify-space-between mb-2">
      <span class="text-subtitle-1">{{ t('tags.appearances') }}</span>
      <span v-if="appearanceCount > 0" class="text-caption text-medium-emphasis">
        {{ appearanceCount }}
      </span>
    </div>

    <div v-if="loading" class="d-flex justify-center py-6">
      <v-progress-circular indeterminate color="primary" size="28" />
    </div>

    <v-alert
      v-else-if="!items.length"
      type="info"
      variant="tonal"
      rounded="xl"
      density="comfortable"
    >
      {{ t('tags.play_appearances_empty_text') }}
    </v-alert>

    <div v-else class="tag-appearances__grid">
      <button
        v-for="item in items"
        :key="item.key || `face-${item.faceId}`"
        type="button"
        class="tag-appearances__card"
        :title="cardTitle(item)"
        @click="playOne(item)"
      >
        <div class="tag-appearances__thumb-wrap">
          <v-img
            :src="thumbUrl(item)"
            :aspect-ratio="1"
            cover
            class="tag-appearances__thumb"
          />
          <span class="tag-appearances__time">{{ timeLabel(item) }}</span>
        </div>
        <div class="tag-appearances__name text-caption text-truncate">
          {{ item.name || item.basename || `#${item.id}` }}
        </div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import {onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import path from 'path-browserify'
import type {FaceAppearanceItem} from '@shared/api/responses'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {usePlayerStore} from '@/stores/player'
import {typedApi} from '@/services/typedApi'
import {buildLocalFileUrl} from '@/services/fileService'
import {getReadableDuration} from '@/services/formatUtils'
import {setNotification} from '@/services/notificationService'
import {loadTagAppearancesForPlayback} from '@/services/tagAppearancesPlayback'
import {CARD_THUMB_MAX_EDGE, resolveMediaThumbDisplayUrl} from '@/utils/thumbSource'
import {IMAGE_UNAVAILABLE_URL} from '@/utils/imageSource'

const props = defineProps<{
  tagId: number
}>()

const {t} = useI18n()
const appStore = useAppStore()
const itemsStore = useItemsStore()
const playerStore = usePlayerStore()

const loading = ref(false)
const playing = ref(false)
const appearanceCount = ref(0)
const items = ref<FaceAppearanceItem[]>([])

const FEED_LIMIT = 48

function thumbUrl(item: FaceAppearanceItem): string {
  if (item.cropPath && appStore.dbPath) {
    return buildLocalFileUrl(path.join(appStore.dbPath, item.cropPath))
  }
  if (appStore.dbPath && item.id != null) {
    return resolveMediaThumbDisplayUrl(
      appStore.dbPath,
      'videos',
      item.id,
      'thumbs',
      {maxEdge: CARD_THUMB_MAX_EDGE},
    ) || IMAGE_UNAVAILABLE_URL
  }
  return IMAGE_UNAVAILABLE_URL
}

function timeLabel(item: FaceAppearanceItem): string {
  if (item.timestamp) return String(item.timestamp)
  return getReadableDuration(Number(item.segmentStart) || 0)
}

function cardTitle(item: FaceAppearanceItem): string {
  const name = item.name || item.basename || `#${item.id}`
  return `${name} · ${timeLabel(item)}`
}

async function refresh() {
  if (!props.tagId) return
  loading.value = true
  try {
    const [countRes, listRes] = await Promise.all([
      typedApi.getFacesForTag({tagId: props.tagId, countOnly: true}),
      typedApi.getFacesForTag({tagId: props.tagId, sort: 'time', limit: FEED_LIMIT}),
    ])
    appearanceCount.value = Number(countRes.data?.count ?? 0)
    items.value = listRes.data?.items || []
  } catch (error) {
    console.warn('Failed to load face appearances:', error)
    appearanceCount.value = 0
    items.value = []
  } finally {
    loading.value = false
  }
}

async function playAppearances(sort: 'time' | 'shuffle' = 'time') {
  if (!props.tagId || playing.value) return
  playing.value = true
  try {
    const loaded = await loadTagAppearancesForPlayback(async (body) => {
      const res = await typedApi.getFacesForTag(body)
      return {
        items: res.data?.items || [],
        count: Number(res.data?.count ?? 0),
      }
    }, props.tagId, sort)

    appearanceCount.value = loaded.count

    if (loaded.empty || !loaded.first) {
      setNotification({
        type: 'warning',
        title: t('tags.play_appearances_empty_title'),
        text: t('tags.play_appearances_empty_text'),
      })
      return
    }

    await itemsStore.playVideo({
      video: loaded.first,
      videos: [loaded.first],
      time: loaded.first.segmentStart,
      trustPath: true,
    })

    if (loaded.playlist.length > 1) {
      playerStore.setPlaylistItems(loaded.playlist)
    }
  } catch (error) {
    setNotification({
      type: 'error',
      title: t('common.error'),
      text: error instanceof Error ? error.message : String(error),
    })
  } finally {
    playing.value = false
  }
}

async function playOne(item: FaceAppearanceItem) {
  if (playing.value) return
  playing.value = true
  try {
    await itemsStore.playVideo({
      video: item,
      videos: [item],
      time: item.segmentStart,
      trustPath: true,
    })
  } catch (error) {
    setNotification({
      type: 'error',
      title: t('common.error'),
      text: error instanceof Error ? error.message : String(error),
    })
  } finally {
    playing.value = false
  }
}

onMounted(() => {
  void refresh()
})

watch(() => props.tagId, () => {
  void refresh()
})
</script>

<style scoped>
.tag-appearances__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 10px;
}

.tag-appearances__card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  border-radius: 12px;
}

.tag-appearances__card:hover .tag-appearances__thumb-wrap {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 1px;
}

.tag-appearances__thumb-wrap {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  background: rgba(var(--v-theme-on-surface), 0.08);
}

.tag-appearances__time {
  position: absolute;
  right: 4px;
  bottom: 4px;
  padding: 1px 5px;
  border-radius: 6px;
  font-size: 10px;
  line-height: 1.3;
  color: #fff;
  background: rgba(0, 0, 0, 0.65);
}

.tag-appearances__name {
  opacity: 0.85;
}
</style>
