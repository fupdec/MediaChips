<template>
  <div
    v-if="playerStore.areaSelecting"
    ref="overlayEl"
    class="player-area-select"
    data-ignore-player-gestures
    @pointerdown.stop.prevent="onPointerDown"
    @pointermove.stop="onPointerMove"
    @pointerup.stop="onPointerUp"
    @pointercancel.stop="cancelDrag"
    @mousedown.stop
    @click.stop
    @dblclick.stop
  >
    <div v-if="rect" :style="rectStyle" class="player-area-select__rect"/>
    <div v-else class="player-area-select__hint">{{ t('player.area_select_hint') }}</div>
  </div>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {usePlayerStore} from '@/stores/player'
import {zoomToSelection, clampPan, zoomPercent, type SelectionRect} from '@/utils/playerZoom'

const props = defineProps<{ size: { width: number; height: number } }>()
const {t} = useI18n()
const playerStore = usePlayerStore()
const overlayEl = ref<HTMLElement | null>(null)
const rect = ref<SelectionRect | null>(null)
let start: { id: number; x: number; y: number } | null = null

const rectStyle = computed(() => rect.value && ({
  left: `${rect.value.x}px`,
  top: `${rect.value.y}px`,
  width: `${rect.value.width}px`,
  height: `${rect.value.height}px`,
}))

const localPoint = (event: PointerEvent) => {
  const box = overlayEl.value?.getBoundingClientRect()
  const x = Math.min(props.size.width, Math.max(0, event.clientX - (box?.left ?? 0)))
  const y = Math.min(props.size.height, Math.max(0, event.clientY - (box?.top ?? 0)))
  return {x, y}
}

const onPointerDown = (event: PointerEvent) => {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  const point = localPoint(event)
  start = {id: event.pointerId, ...point}
  rect.value = null
  try { overlayEl.value?.setPointerCapture(event.pointerId) } catch { /* the drag still works inside the overlay */ }
}

const onPointerMove = (event: PointerEvent) => {
  if (!start || event.pointerId !== start.id) return
  const point = localPoint(event)
  rect.value = {
    x: Math.min(start.x, point.x),
    y: Math.min(start.y, point.y),
    width: Math.abs(point.x - start.x),
    height: Math.abs(point.y - start.y),
  }
}

const cancelDrag = () => {
  start = null
  rect.value = null
}

const onPointerUp = (event: PointerEvent) => {
  if (!start || event.pointerId !== start.id) return
  const selection = rect.value
  cancelDrag()
  if (!selection) {
    // A plain click without a drag leaves the mode.
    playerStore.areaSelecting = false
    return
  }
  const current = {zoom: playerStore.zoom, pan: clampPan({x: playerStore.panX, y: playerStore.panY}, playerStore.zoom, props.size)}
  const result = zoomToSelection(selection, current, props.size)
  if (!result) return
  playerStore.zoom = result.zoom
  playerStore.panX = result.pan.x
  playerStore.panY = result.pan.y
  playerStore.areaSelecting = false
  playerStore.changePlayerStatusText({
    text: zoomPercent(result.zoom),
    icon: 'magnify-plus-outline',
    subtitleKey: 'player.zoom_label',
  })
}
</script>
