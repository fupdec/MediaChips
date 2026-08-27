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
        <PlayerTrimBar v-if="player.trimMode"/>
      </Transition>

      <Transition name="mark-inspector">
        <PlayerMarkInspector
          v-if="player.studioMode || dialogsStore.markAdding.show"
          @saveMark="emit('saveMark', $event)"
          @escape="transport.exitStudioLayer()"
        />
      </Transition>

      <PlayerTimeline
        ref="timelineRef"
        :is-audio-mode="isAudioMode"
        @showControls="emit('showControls')"
        @removeMark="emit('removeMark', $event)"
        @playNext="transport.next()"
      />

      <PlayerTransport/>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import {computed, provide, ref} from 'vue'
import {usePlayerStore} from '@/stores/player'
import {useDialogsStore} from '@/stores/dialogs'
import {usePlayerTransport} from '@/composable/usePlayerTransport'
import {PLAYER_TRANSPORT_KEY, type PlayerTransportEmit} from '@/composable/playerTransportKey'
import PlayerTimeline from '@/components/app/player/PlayerTimeline.vue'
import PlayerTransport from '@/components/app/player/PlayerTransport.vue'
import PlayerMarkInspector from '@/components/app/player/PlayerMarkInspector.vue'
import PlayerTrimBar from '@/components/app/player/PlayerTrimBar.vue'
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

const jumpToMark = (type: 'prev' | 'next') => {
  timelineRef.value?.jumpToMark?.(type)
}

const transport = usePlayerTransport({
  emit: emit as PlayerTransportEmit,
  jumpToMark,
})

provide(PLAYER_TRANSPORT_KEY, {
  ...transport,
  emit: emit as PlayerTransportEmit,
})

defineExpose({
  togglePause: transport.togglePause,
  play: transport.play,
  pause: transport.pause,
  stop: transport.stop,
  prev: transport.prev,
  next: transport.next,
  toggleMute: transport.toggleMute,
  togglePlaylist: transport.togglePlaylist,
  toggleMarks: transport.toggleMarks,
  toggleStudioMode: transport.toggleStudioMode,
  exitStudioLayer: transport.exitStudioLayer,
  jumpToMark,
  wheelSeek: (event: WheelEvent) => timelineRef.value?.wheelSeek?.(event),
  editVideo: transport.editVideo,
  deleteVideo: transport.deleteVideo,
  resize: () => timelineRef.value?.resize?.(),
  toggleTrimMode: transport.toggleTrimMode,
  exitTrimMode: transport.exitTrimMode,
  applyTrim: transport.applyTrim,
  setTrimIn: () => transport.setTrimPoint('start'),
  setTrimOut: () => transport.setTrimPoint('end'),
})
</script>
