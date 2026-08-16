<template>
  <v-card
    @mouseenter="player.mouseOverControls = true"
    @mouseleave="player.mouseOverControls = false"
    :class="{hidden: !player.isControlsVisible}"
    class="controls"
    variant="text"
    theme="dark"
    :ripple="false"
  >
    <div class="controls-inner px-6" @click.stop @dblclick.stop>
      <Transition name="mark-inspector">
        <PlayerMarkInspector
          v-if="player.studioMode || dialogsStore.markAdding.show"
          @saveMark="emit('saveMark', $event)"
          @escape="transportRef?.exitStudioLayer?.()"
        />
      </Transition>

      <PlayerTimeline
        ref="timelineRef"
        :is-audio-mode="isAudioMode"
        @showControls="emit('showControls')"
        @removeMark="emit('removeMark', $event)"
        @playNext="playNext"
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
    </div>
  </v-card>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import {usePlayerStore} from '@/stores/player'
import {useDialogsStore} from '@/stores/dialogs'
import PlayerTimeline from '@/components/app/player/PlayerTimeline.vue'
import PlayerTransport from '@/components/app/player/PlayerTransport.vue'
import PlayerMarkInspector from '@/components/app/player/PlayerMarkInspector.vue'
import type {PlayerMark, PlayVideoSwitch} from '@/types/player'

const emit = defineEmits<{
  toggleFullscreen: []
  togglePictureInPicture: []
  play: [payload: PlayVideoSwitch]
  changeVolume: [payload: { deltaY?: number; volume?: number }]
  showControls: []
  addMark: []
  saveMark: [data: Record<string, unknown>]
  removeMark: [mark: PlayerMark]
  close: []
  updateVideo: [id: number | string]
}>()

const playerStore = usePlayerStore()
const dialogsStore = useDialogsStore()
const player = computed(() => playerStore)
const isAudioMode = computed(() => playerStore.isAudioMode)

const timelineRef = ref<InstanceType<typeof PlayerTimeline> | null>(null)
const transportRef = ref<InstanceType<typeof PlayerTransport> | null>(null)

const jumpToMark = (type: 'prev' | 'next') => {
  timelineRef.value?.jumpToMark?.(type)
}

const playNext = () => {
  transportRef.value?.next?.()
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
  toggleStudioMode: () => transportRef.value?.toggleStudioMode?.(),
  exitStudioLayer: () => transportRef.value?.exitStudioLayer?.(),
  jumpToMark,
  wheelSeek: (event: WheelEvent) => timelineRef.value?.wheelSeek?.(event),
  editVideo: () => transportRef.value?.editVideo?.(),
  deleteVideo: (withFile = false) => transportRef.value?.deleteVideo?.(withFile),
  resize: () => timelineRef.value?.resize?.(),
})
</script>
