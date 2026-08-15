<template>
  <div
    class="mark-clip"
    :class="{
      'mark-clip--point': !hasRange,
      'mark-clip--selected': selected,
      'mark-clip--dragging': dragging,
      'mark-clip--dimmed': dimmed,
    }"
    :style="positionStyle"
    @pointerdown="onBodyPointerDown"
    @dblclick.stop="onDoubleClick"
  >
    <div class="mark-clip__body" :style="{ background: color }">
      <v-icon size="12" color="white">mdi-{{ icon }}</v-icon>
    </div>

    <div
      v-if="hasRange"
      class="mark-clip__handle mark-clip__handle--start"
      @pointerdown="onHandlePointerDown('resize-start', $event)"
    />
    <div
      v-if="hasRange"
      class="mark-clip__handle mark-clip__handle--end"
      @pointerdown="onHandlePointerDown('resize-end', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { usePlayerStore } from '@/stores/player'
import { usePlayerMarkStudio, type MarkDragMode } from '@/composable/usePlayerMarkStudio'
import { getMarkTimelineColor, getMarkTimelineIcon } from '@/composable/playerMarkDisplay'
import type { PlayerMark } from '@/types/player'

const props = defineProps<{
  mark: PlayerMark
  controls_width: number
  dimmed?: boolean
}>()

const playerStore = usePlayerStore()
const { startDrag } = usePlayerMarkStudio()

const draft = computed(() => (
  playerStore.markDraft && playerStore.markDraft.id === props.mark.id
    ? playerStore.markDraft
    : null
))

const displayTime = computed(() => draft.value?.time ?? props.mark.time)
const displayEnd = computed(() => (draft.value ? draft.value.end : props.mark.end) ?? null)

const hasRange = computed(() => displayEnd.value != null)
const selected = computed(() => playerStore.selectedMarkId === props.mark.id)
const dragging = computed(() => draft.value != null)

const color = computed(() => getMarkTimelineColor(props.mark))
const icon = computed(() => getMarkTimelineIcon(props.mark))

const leftPercent = computed(() => {
  const duration = playerStore.duration
  if (!duration) return 0
  return Math.max(0, Math.min(100, displayTime.value / duration * 100))
})

const widthPx = computed(() => {
  const duration = playerStore.duration
  if (!hasRange.value || !props.controls_width || !duration) return 0

  const start = Math.max(0, Math.min(duration, displayTime.value))
  const end = Math.max(start, Math.min(duration, displayEnd.value ?? start))
  return props.controls_width / 100 * ((end - start) / duration * 100)
})

const positionStyle = computed(() => ({
  left: `${leftPercent.value}%`,
  width: hasRange.value ? `${widthPx.value}px` : undefined,
}))

const onBodyPointerDown = (event: PointerEvent) => {
  if (event.button !== 0) return
  startDrag(props.mark, 'move', event, props.controls_width)
}

const onHandlePointerDown = (mode: MarkDragMode, event: PointerEvent) => {
  if (event.button !== 0) return
  startDrag(props.mark, mode, event, props.controls_width)
}

const onDoubleClick = () => {
  playerStore.playerJumpTo(displayTime.value)
  playerStore.playerPlay()
}
</script>
