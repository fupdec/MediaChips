<template>
  <div
    v-if="player.trimMode && player.duration > 0"
    class="timeline-trim"
    :class="{'timeline-trim--dragging': dragging}"
  >
    <div class="timeline-trim__rail"/>
    <div class="timeline-trim__dim timeline-trim__dim--start" :style="startDimStyle"/>
    <div
      class="timeline-trim__range"
      :style="rangeStyle"
      @pointerdown.stop="onBodyPointerDown"
    >
      <div
        class="timeline-trim__handle timeline-trim__handle--start"
        @pointerdown.stop="onHandlePointerDown('start', $event)"
      >
        <span class="timeline-trim__grip"/>
        <span class="timeline-trim__stamp">{{ startLabel }}</span>
      </div>
      <div
        class="timeline-trim__handle timeline-trim__handle--end"
        @pointerdown.stop="onHandlePointerDown('end', $event)"
      >
        <span class="timeline-trim__grip"/>
        <span class="timeline-trim__stamp">{{ endLabel }}</span>
      </div>
    </div>
    <div class="timeline-trim__dim timeline-trim__dim--end" :style="endDimStyle"/>
    <div class="timeline-trim__playhead" :style="playheadStyle"/>
  </div>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref} from 'vue'
import {usePlayerStore} from '@/stores/player'
import {clampTrimValue} from '@shared/playerTrim'
import {getReadableDuration} from '@/services/formatUtils'

const props = defineProps<{
  controlsWidth: number
}>()

const player = usePlayerStore()
const dragging = ref(false)

type DragKind = 'start' | 'end' | 'move'

let drag: {
  kind: DragKind
  originX: number
  start: number
  end: number
} | null = null

const leftPercent = computed(() => {
  if (!player.duration) return 0
  return clampTrimValue(player.trimStart / player.duration * 100, 0, 100)
})

const rightPercent = computed(() => {
  if (!player.duration) return 0
  return clampTrimValue(100 - (player.trimEnd / player.duration * 100), 0, 100)
})

const startDimStyle = computed(() => ({width: `${leftPercent.value}%`}))
const endDimStyle = computed(() => ({width: `${rightPercent.value}%`}))
const rangeStyle = computed(() => ({
  left: `${leftPercent.value}%`,
  width: `${Math.max(0.8, 100 - leftPercent.value - rightPercent.value)}%`,
}))
const playheadStyle = computed(() => {
  if (!player.duration) return {left: '0%'}
  const time = player.seeking ? player.seekTime : player.currentTime
  return {left: `${clampTrimValue(time / player.duration * 100, 0, 100)}%`}
})
const startLabel = computed(() => getReadableDuration(player.trimStart))
const endLabel = computed(() => getReadableDuration(player.trimEnd))

function pxToSeconds(deltaX: number): number {
  if (!props.controlsWidth || !player.duration) return 0
  return deltaX * player.duration / props.controlsWidth
}

function onHandlePointerDown(kind: 'start' | 'end', event: PointerEvent) {
  beginDrag(kind, event)
}

function onBodyPointerDown(event: PointerEvent) {
  beginDrag('move', event)
}

function beginDrag(kind: DragKind, event: PointerEvent) {
  if (event.button != null && event.button !== 0) return
  dragging.value = true
  drag = {
    kind,
    originX: event.clientX,
    start: player.trimStart,
    end: player.trimEnd,
  }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
}

function onPointerMove(event: PointerEvent) {
  if (!drag) return
  const delta = pxToSeconds(event.clientX - drag.originX)
  const duration = player.duration
  if (drag.kind === 'start') {
    player.trimStart = clampTrimValue(drag.start + delta, 0, player.trimEnd - 0.25)
    return
  }
  if (drag.kind === 'end') {
    player.trimEnd = clampTrimValue(drag.end + delta, player.trimStart + 0.25, duration)
    return
  }
  const span = drag.end - drag.start
  const nextStart = clampTrimValue(drag.start + delta, 0, Math.max(0, duration - span))
  player.trimStart = nextStart
  player.trimEnd = nextStart + span
}

function onPointerUp() {
  dragging.value = false
  drag = null
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
}

onBeforeUnmount(onPointerUp)
</script>
