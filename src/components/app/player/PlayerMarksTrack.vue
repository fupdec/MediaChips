<template>
  <div
    class="marks-track"
    :style="trackStyle"
    @pointerdown="onTrackPointerDown"
    @wheel="onTrackWheel"
  >
    <span
      v-if="playerStore.marks.length === 0 && !playerStore.creatingMarkDraft"
      class="marks-track__hint"
    >
      <v-icon size="14">mdi-plus</v-icon>
      {{ t('player.studio_track_empty') }}
    </span>

    <div
      v-if="playerStore.studioSnapTime != null"
      class="marks-track__snap"
      :style="snapStyle"
    />

    <div
      v-if="playerStore.creatingMarkDraft"
      class="mark-clip mark-clip--creating"
      :style="creatingStyle"
    />

    <div
      v-if="dialogsStore.markAdding.show"
      class="mark-clip mark-clip--adding"
      :class="{ 'mark-clip--point': !addingHasRange }"
      :style="addingPositionStyle"
      @pointerdown="onAddingBodyPointerDown"
    >
      <div class="mark-clip__body" :style="{ background: addingColor }">
        <v-icon size="12" color="white">mdi-{{ addingIcon }}</v-icon>
      </div>

      <div
        v-if="addingHasRange"
        class="mark-clip__handle mark-clip__handle--start"
        @pointerdown="onAddingHandlePointerDown('resize-start', $event)"
      />
      <div
        class="mark-clip__handle mark-clip__handle--end"
        @pointerdown="onAddingHandlePointerDown('resize-end', $event)"
      />
    </div>

    <PlayerMarkClip
      v-for="mark in visibleMarks"
      :key="mark.id"
      :mark="mark"
      :controls_width="controls_width"
      :lane="laneOf(mark.id)"
      :dimmed="isAddingNew"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlayerStore } from '@/stores/player'
import { useDialogsStore } from '@/stores/dialogs'
import { usePlayerMarkStudio, type MarkDragMode } from '@/composable/usePlayerMarkStudio'
import { DEFAULT_BOOKMARK_ICON, FAVORITE_MARK_ICON, isTagMarkType, normalizeMarkIcon } from '@/utils/markAdding'
import PlayerMarkClip from '@/components/app/player/PlayerMarkClip.vue'

const props = defineProps<{
  controls_width: number
}>()

const { t } = useI18n()
const playerStore = usePlayerStore()
const dialogsStore = useDialogsStore()
const { startCreateDrag, startAddingDrag, nudgeSelectedMark, dispose } = usePlayerMarkStudio()

const visibleMarks = computed(() => {
  if (!dialogsStore.markAdding.show) return playerStore.marks
  const editId = Number(dialogsStore.markAdding.editId)
  if (!editId) return playerStore.marks
  return playerStore.marks.filter((mark) => mark.id !== editId)
})

const isAddingNew = computed(() => (
  dialogsStore.markAdding.show && !Number(dialogsStore.markAdding.editId)
))

const trackStyle = computed(() => ({
  '--marks-track-lanes': '1',
}))

const laneOf = (_id?: number | null) => 0

const creatingStyle = computed(() => {
  const draft = playerStore.creatingMarkDraft
  const duration = playerStore.duration
  if (!draft || !duration || !props.controls_width) return {}

  const start = Math.max(0, Math.min(duration, draft.time))
  const end = Math.max(start, Math.min(duration, draft.end))
  const left = start / duration * 100
  const width = props.controls_width / 100 * ((end - start) / duration * 100)
  return { left: `${left}%`, width: `${width}px` }
})

const snapStyle = computed(() => {
  const snapTime = playerStore.studioSnapTime
  const duration = playerStore.duration
  if (snapTime == null || !duration) return {}
  return { left: `${Math.max(0, Math.min(100, snapTime / duration * 100))}%` }
})

const addingHasRange = computed(() => Boolean(
  dialogsStore.markAdding.is_end_time_active && dialogsStore.markAdding.end != null,
))
const addingTime = computed(() => dialogsStore.markAdding.time ?? 0)
const addingEnd = computed(() => dialogsStore.markAdding.end ?? addingTime.value)

const addingColor = computed(() => dialogsStore.markAdding.color || '#f44336')
const addingIcon = computed(() => {
  const type = dialogsStore.markAdding.type
  if (type === 'favorite') return FAVORITE_MARK_ICON
  if (isTagMarkType(String(type))) return 'tag'
  return normalizeMarkIcon(dialogsStore.markAdding.icon, DEFAULT_BOOKMARK_ICON)
})

const addingPositionStyle = computed(() => {
  const duration = playerStore.duration
  if (!duration) return {}

  const left = Math.max(0, Math.min(100, addingTime.value / duration * 100))
  if (!addingHasRange.value) return { left: `${left}%` }

  const start = Math.max(0, Math.min(duration, addingTime.value))
  const end = Math.max(start, Math.min(duration, addingEnd.value))
  const width = props.controls_width / 100 * ((end - start) / duration * 100)
  return { left: `${left}%`, width: `${width}px` }
})

const onTrackPointerDown = (event: PointerEvent) => {
  if (event.target !== event.currentTarget) return
  startCreateDrag(event, event.currentTarget as HTMLElement)
}

const onAddingBodyPointerDown = (event: PointerEvent) => {
  startAddingDrag('move', event, props.controls_width)
}

const onAddingHandlePointerDown = (mode: MarkDragMode, event: PointerEvent) => {
  startAddingDrag(mode, event, props.controls_width)
}

const onTrackWheel = (event: WheelEvent) => {
  nudgeSelectedMark(event)
}

onBeforeUnmount(() => {
  dispose()
})
</script>
