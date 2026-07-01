<template>
  <v-card
    @mouseenter="player.mouseOverControls = true"
    @mouseleave="player.mouseOverControls = false"
    :class="{hidden: !player.isControlsVisible}"
    class="controls px-6"
    variant="text"
    theme="dark"
  >
    <PlayerTimeline
      ref="timelineRef"
      :is-audio-mode="isAudioMode"
      @showControls="emit('showControls')"
      @removeMark="emit('removeMark', $event)"
    />

    <PlayerTransport
      ref="transportRef"
      :jump-to-mark="jumpToMark"
      @toggleFullscreen="emit('toggleFullscreen')"
      @togglePictureInPicture="emit('togglePictureInPicture')"
      @play="emit('play', $event)"
      @changeVolume="emit('changeVolume', $event)"
      @showControls="emit('showControls')"
      @addMark="emit('addMark')"
      @removeMark="emit('removeMark', $event)"
      @close="emit('close')"
      @updateVideo="emit('updateVideo', $event)"
    />
  </v-card>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import {usePlayerStore} from '@/stores/player'
import PlayerTimeline from '@/components/app/player/PlayerTimeline.vue'
import PlayerTransport from '@/components/app/player/PlayerTransport.vue'
import type {PlayerMark, PlayVideoSwitch} from '@/types/player'

const emit = defineEmits<{
  toggleFullscreen: []
  togglePictureInPicture: []
  play: [payload: PlayVideoSwitch]
  changeVolume: [payload: { deltaY?: number; volume?: number }]
  showControls: []
  addMark: []
  removeMark: [mark: PlayerMark]
  close: []
  updateVideo: [id: number | string]
}>()

const playerStore = usePlayerStore()
const player = computed(() => playerStore)
const isAudioMode = computed(() => playerStore.isAudioMode)

const timelineRef = ref<InstanceType<typeof PlayerTimeline> | null>(null)
const transportRef = ref<InstanceType<typeof PlayerTransport> | null>(null)

const jumpToMark = (type: 'prev' | 'next') => {
  timelineRef.value?.jumpToMark?.(type)
}

defineExpose({
  togglePause: () => transportRef.value?.togglePause?.(),
  play: () => transportRef.value?.play?.(),
  pause: () => transportRef.value?.pause?.(),
  stop: () => transportRef.value?.stop?.(),
  prev: () => transportRef.value?.prev?.(),
  next: () => transportRef.value?.next?.(),
  toggleMute: () => transportRef.value?.toggleMute?.(),
  togglePlaylist: () => transportRef.value?.togglePlaylist?.(),
  toggleMarks: () => transportRef.value?.toggleMarks?.(),
  jumpToMark,
  wheelSeek: (event: WheelEvent) => timelineRef.value?.wheelSeek?.(event),
  editVideo: () => transportRef.value?.editVideo?.(),
  deleteVideo: (withFile = false) => transportRef.value?.deleteVideo?.(withFile),
  resize: () => timelineRef.value?.resize?.(),
})
</script>
