<template>
  <div
    @click="play"
    :class="{
      'playlist-item--active': is_now_playing,
      'playlist-item--missing': !is_file_exists,
      'playlist-item--locked': is_locked,
    }"
    class="playlist-item"
  >
    <div class="playlist-item__thumb-wrap">
      <v-img
        :key="video.id"
        :src="thumb ?? undefined"
        :aspect-ratio="16 / 9"
        :id="'video_'+video.id"
        class="playlist-item__thumb"
        cover
      />
      <div v-if="is_now_playing" class="playlist-item__playing">
        <v-icon size="small" color="white">mdi-equalizer</v-icon>
      </div>
      <div v-if="is_locked" class="playlist-item__lock">
        <v-icon size="x-small">mdi-lock</v-icon>
      </div>
    </div>

    <div class="playlist-item__info">
      <span class="playlist-item__index">{{ index + 1 }}</span>
      <div class="playlist-item__text">
        <span class="playlist-item__name" :title="displayName" v-text="displayName"/>
        <span v-if="durationLabel" class="playlist-item__duration" v-text="durationLabel"/>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {usePlaylistItem} from '@/composable/usePlaylistItem'
import {getSegmentEnd, getSegmentStart} from '@/utils/mediaItem'
import type {MediaItem} from '@/types/stores'

const props = defineProps<{
  video: MediaItem
  index: number
}>()

const emit = defineEmits<{
  play: [index: number]
}>()

const {
  thumb,
  is_file_exists,
  is_now_playing,
  is_locked,
  getDuration,
  play,
} = usePlaylistItem(props, emit)

const segmentStart = computed(() => getSegmentStart(props.video))
const segmentEnd = computed(() => getSegmentEnd(props.video))

const displayName = computed(() => {
  const name = props.video.name || ''
  if (segmentStart.value == null || segmentEnd.value == null) return name
  return `${name} · ${getDuration(segmentStart.value)} – ${getDuration(segmentEnd.value)}`
})

const durationLabel = computed(() => {
  if (segmentStart.value != null && segmentEnd.value != null) {
    const length = Math.max(0, segmentEnd.value - segmentStart.value)
    return getDuration(length)
  }
  if (props.video.duration) return getDuration(props.video.duration)
  return ''
})
</script>
