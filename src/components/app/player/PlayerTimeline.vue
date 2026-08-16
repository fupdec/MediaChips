<template>
  <v-card-actions
    @wheel.prevent="wheelSeek"
    @mousemove.capture="saveEvent($event); showPreview($event)"
    @mouseleave="clearPreviewHover"
    class="timeline pa-0"
    :class="{'timeline--studio': player.studioMode}"
    ref="slider_progress"
  >
    <Transition name="up-next-slide">
      <PlayerNeighborPreview
        v-if="showUpNext && nextItem && !isAudioMode"
        :item="nextItem"
        :thumb="nextThumb"
        :label="t('player.controls.up_next')"
        :remaining-seconds="remainingSeconds"
        variant="up-next"
        clickable
        class="neighbor-preview--up-next"
        @select="emit('playNext')"
      />
    </Transition>

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

    <PlayerMarksTrack v-if="player.studioMode" :controls_width="controls_width"/>

    <Preview v-if="!isAudioMode"/>

    <template v-if="!player.studioMode">
      <Mark
        v-for="mark in player.marks"
        @removeMark="onRemoveMark"
        :key="mark.id"
        :mark="mark"
        :controls_width="controls_width"
      />
    </template>
  </v-card-actions>
</template>

<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import {usePlayerNeighborPreview} from '@/composable/usePlayerNeighborPreview'
import Preview from '@/components/app/player/Preview.vue'
import Mark from '@/components/app/player/Mark.vue'
import PlayerMarksTrack from '@/components/app/player/PlayerMarksTrack.vue'
import PlayerNeighborPreview from '@/components/app/player/PlayerNeighborPreview.vue'
import {usePlayerTimeline} from '@/composable/usePlayerTimeline'
import type {PlayerMark} from '@/types/player'

defineProps<{
  isAudioMode?: boolean
}>()

const emit = defineEmits<{
  showControls: []
  removeMark: [mark: PlayerMark]
  playNext: []
}>()

const {t} = useI18n()

const {
  nextItem,
  nextThumb,
  remainingSeconds,
  showUpNext,
} = usePlayerNeighborPreview()

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
