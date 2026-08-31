<template>
  <div :class="{ 'no-file': !isFileExists }">
    <v-responsive
      v-if="isViewCard"
      v-ripple="{ class: 'text-primary' }"
      :aspect-ratio="1"
      class="audio-preview-container"
      @click.stop="play"
    >
      <v-img
        v-if="thumb && !thumbFailed"
        :src="thumb"
        class="audio-preview-container__cover"
        cover
        @error="thumbFailed = true"
      />
      <div
        v-else
        class="audio-preview-container__icon d-flex align-center justify-center"
      >
        <v-icon size="56" color="grey-lighten-1">mdi-music</v-icon>
      </div>

      <div
        v-if="id3Line"
        class="audio-preview-container__id3"
        :title="id3Line"
      >
        {{ id3Line }}
      </div>

      <div
        v-if="metaBadges.length"
        class="audio-preview-container__meta"
      >
        <span
          v-for="badge in metaBadges"
          :key="badge"
          class="audio-preview-container__meta-chip"
        >
          {{ badge }}
        </span>
      </div>

      <div v-if="durationLabel" class="duration">{{ durationLabel }}</div>
    </v-responsive>
  </div>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {getReadableDuration} from '@/services/formatUtils'
import {resolveMediaThumbDisplayUrl} from '@/utils/thumbSource'
import type {MediaItem} from '@/types/stores'

const props = defineProps<{
  media: MediaItem
  isFileExists?: boolean
}>()

const appStore = useAppStore()
const itemsStore = useItemsStore()
const thumbFailed = ref(false)

const isViewCard = computed(() =>
  Number(itemsStore.view) === 1 || Number(itemsStore.view) === 5
)

const thumb = computed(() => {
  const id = props.media?.id
  if (id == null || !appStore.mediaPath) return null
  return resolveMediaThumbDisplayUrl(appStore.mediaPath, 'audios', id)
})

watch(() => props.media?.id, () => {
  thumbFailed.value = false
})

const durationLabel = computed(() => {
  const duration = Number(props.media?.duration || 0)
  if (!duration) return ''
  return getReadableDuration(duration)
})

const metaBadges = computed(() => {
  const badges: string[] = []
  const codec = String((props.media as {codec?: string | null})?.codec || '').trim()
  if (codec) badges.push(codec.toUpperCase())

  const bitrate = Number((props.media as {bitrate?: number | string | null})?.bitrate || 0)
  if (Number.isFinite(bitrate) && bitrate > 0) {
    const kbps = bitrate >= 1000 ? Math.round(bitrate / 1000) : Math.round(bitrate)
    if (kbps > 0) badges.push(`${kbps} kbps`)
  }
  return badges.slice(0, 2)
})

const id3Line = computed(() => {
  const artist = String((props.media as {artist?: string | null})?.artist || '').trim()
  const album = String((props.media as {album?: string | null})?.album || '').trim()
  return [artist, album].filter(Boolean).join(' · ')
})

const play = () => {
  if (!props.isFileExists) return
  itemsStore.playVideo({video: props.media})
}
</script>

<style scoped>
.audio-preview-container {
  position: relative;
  background: rgb(120 120 120 / 12%);
  cursor: pointer;
  overflow: hidden;
}

.audio-preview-container__icon,
.audio-preview-container__cover {
  width: 100%;
  height: 100%;
}

.audio-preview-container__meta {
  position: absolute;
  left: 6px;
  top: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-width: calc(100% - 12px);
}

.audio-preview-container__id3 {
  position: absolute;
  left: 6px;
  right: 6px;
  bottom: 28px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgb(0 0 0 / 55%);
  color: #fff;
  font-size: 11px;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.audio-preview-container__meta-chip {
  padding: 2px 6px;
  border-radius: 4px;
  background: rgb(0 0 0 / 55%);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 1.2;
  text-transform: uppercase;
}

.duration {
  position: absolute;
  right: 6px;
  bottom: 6px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgb(0 0 0 / 65%);
  color: #fff;
  font-size: 12px;
  line-height: 1.2;
}
</style>
