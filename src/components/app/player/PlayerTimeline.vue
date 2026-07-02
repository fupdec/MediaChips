<template>
  <v-card-actions
    @wheel.prevent="wheelSeek"
    @mousemove.capture="saveEvent($event); showPreview($event)"
    @mouseleave="clearPreviewHover"
    class="timeline pa-0"
    ref="slider_progress"
  >
    <v-slider
      :model-value="timelineTime"
      @update:model-value="handleSliderChange"
      @start="startSeeking"
      @end="seek"
      @mousedown="handleMouseSeek($event)"
      @wheel.prevent.stop="wheelSeek"
      :disabled="!player.is_file_exists || player.playbackError"
      :track-size="2"
      :class="[
        'timeline-slider pt-4',
        {
          'timeline-slider--transcode': showTranscodeTimeline,
          'timeline-slider--stream': showTranscodeTimeline && timelineDisplay.showStream,
        },
      ]"
      :style="timelineTrackStyle"
      color="white"
      step="0.05"
      min="0"
      :max="player.duration"
      hide-details
    />

    <controls-set-mark-time v-if="dialogsStore.markAdding.show"/>

    <Preview v-if="!isAudioMode"/>

    <Mark
      v-for="mark in player.marks"
      @removeMark="onRemoveMark"
      :key="mark.id"
      :mark="mark"
      :controls_width="controls_width"
    />
  </v-card-actions>
</template>

<script setup lang="ts">
import {useDialogsStore} from '@/stores/dialogs'
import Preview from '@/components/app/player/Preview.vue'
import Mark from '@/components/app/player/Mark.vue'
import ControlsSetMarkTime from '@/components/app/player/ControlsSetMarkTime.vue'
import {usePlayerTimeline} from '@/composable/usePlayerTimeline'
import type {PlayerMark} from '@/types/player'

defineProps<{
  isAudioMode?: boolean
}>()

const emit = defineEmits<{
  showControls: []
  removeMark: [mark: PlayerMark]
}>()

const dialogsStore = useDialogsStore()

const {
  player,
  slider_progress,
  controls_width,
  showTranscodeTimeline,
  timelineDisplay,
  timelineTime,
  timelineTrackStyle,
  startSeeking,
  seek,
  handleSliderChange,
  wheelSeek,
  handleMouseSeek,
  saveEvent,
  showPreview,
  clearPreviewHover,
  jumpToMark,
  resize,
} = usePlayerTimeline({emit})

const onRemoveMark = (mark: PlayerMark) => {
  emit('removeMark', mark)
}

defineExpose({
  jumpToMark,
  wheelSeek,
  resize,
})
</script>
