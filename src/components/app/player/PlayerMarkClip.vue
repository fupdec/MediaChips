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
      <img
        v-if="hasRange && showThumb && thumb"
        :src="thumb"
        class="mark-clip__thumb"
        alt=""
      />
      <v-icon size="12" color="white">mdi-{{ icon }}</v-icon>
      <span v-if="hasRange && showDuration" class="mark-clip__duration">{{ durationLabel }}</span>
    </div>

    <div
      v-if="hasRange"
      class="mark-clip__handle mark-clip__handle--start"
      @pointerdown="onHandlePointerDown('resize-start', $event)"
    />
    <div
      class="mark-clip__handle mark-clip__handle--end"
      @pointerdown="onHandlePointerDown('resize-end', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { usePlayerStore } from '@/stores/player'
import { useAppStore } from '@/stores/app'
import { useEventBus } from '@/utils/eventBus'
import { usePlayerMarkStudio, type MarkDragMode } from '@/composable/usePlayerMarkStudio'
import { getMarkTimelineColor, getMarkTimelineIcon } from '@/composable/playerMarkDisplay'
import { getReadableDuration } from '@/services/formatUtils'
import { loadMarkImageDisplayUrl } from '@/utils/markThumb'
import type { PlayerMark } from '@/types/player'

const props = defineProps<{
  mark: PlayerMark
  controls_width: number
  lane?: number
  dimmed?: boolean
}>()

const playerStore = usePlayerStore()
const appStore = useAppStore()
const eventBus = useEventBus()
const { startDrag } = usePlayerMarkStudio()
const thumb = ref<string | null>(null)

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

const showThumb = computed(() => widthPx.value >= 40)
const showDuration = computed(() => widthPx.value >= 56)
const durationLabel = computed(() => {
  if (!hasRange.value || displayEnd.value == null) return ''
  return getReadableDuration(Math.max(0, displayEnd.value - displayTime.value))
})

const positionStyle = computed(() => ({
  left: `${leftPercent.value}%`,
  width: hasRange.value ? `${widthPx.value}px` : undefined,
  '--mark-clip-lane': String(props.lane ?? 0),
}))

const loadThumb = async () => {
  if (!appStore.mediaPath || props.mark.id == null) return
  thumb.value = await loadMarkImageDisplayUrl({
    markId: props.mark.id,
    mediaPath: appStore.mediaPath,
    mediaId: playerStore.media?.id,
  })
}

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

onMounted(() => {
  eventBus.on('updateMarkImage', handleUpdateMarkImage)
  void loadThumb()
})

onBeforeUnmount(() => {
  eventBus.off('updateMarkImage', handleUpdateMarkImage)
})

function handleUpdateMarkImage(id: unknown) {
  if (props.mark.id === Number(id)) void loadThumb()
}

watch(() => props.mark.time, () => {
  void loadThumb()
})
</script>
