import { usePlayerStore } from '@/stores/player'
import { useAppStore } from '@/stores/app'
import { useDialogsStore } from '@/stores/dialogs'
import { useEventBus } from '@/utils/eventBus'
import { typedApi } from '@/services/typedApi'
import { getMarkImagePath } from '@/utils/markThumb'
import { invalidateFileExistsCache } from '@/services/fileService'
import { normalizeMarkTime } from '@/utils/markAdding'
import { DEFAULT_BOOKMARK_ICON } from '@shared/markIcons'
import { getMarkRangeDeltaFromWheel, preventWheelDefault } from '@/utils/playerWheel'
import {
  MARK_DRAG_THRESHOLD_PX,
  MIN_MARK_DURATION,
  collectMarkSnapTargets,
  computeMarkDragDraft,
  computeMarkWheelNudge,
  pxToMarkTime,
  timeFromTrackClientX,
  type MarkDragMode,
} from '@/utils/playerMarkStudio'
import type { PlayerMark } from '@/types/player'

export type { MarkDragMode }

let dragMarkId: number | null = null
let dragMode: MarkDragMode | null = null
let startClientX = 0
let startTime = 0
let startEnd: number | null = null
let controlsWidthAtStart = 0
let dragMoved = false
let previousTime = 0
let previousEnd: number | null = null
let listenersAttached = false
let scrubRaf: number | null = null
let pendingScrubTime: number | null = null
let wheelCommitTimer: ReturnType<typeof setTimeout> | null = null
let snapPlayheadAtStart = 0
let wheelOriginTime = 0
let wheelOriginEnd: number | null = null

let createStartClientX = 0
let createStartTime = 0
let createTrackRect: DOMRect | null = null
let createMoved = false

let addingDragMode: MarkDragMode | null = null
let addingStartClientX = 0
let addingStartTime = 0
let addingStartEnd: number | null = null
let addingControlsWidthAtStart = 0

function attachWindowListeners() {
  if (listenersAttached) return
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
  listenersAttached = true
}

function detachWindowListeners() {
  if (!listenersAttached) return
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
  listenersAttached = false
}

export function disposePlayerMarkStudio() {
  detachWindowListeners()
  if (scrubRaf != null) {
    cancelAnimationFrame(scrubRaf)
    scrubRaf = null
  }
  if (wheelCommitTimer) {
    clearTimeout(wheelCommitTimer)
    wheelCommitTimer = null
  }
  dragMarkId = null
  dragMode = null
  createTrackRect = null
  addingDragMode = null
}

function scheduleScrub(time: number) {
  pendingScrubTime = time
  if (scrubRaf != null) return

  scrubRaf = requestAnimationFrame(() => {
    scrubRaf = null
    const next = pendingScrubTime
    pendingScrubTime = null
    if (next == null) return
    scrubPlayhead(next)
  })
}

function scrubPlayhead(time: number) {
  const playerStore = usePlayerStore()
  const clamped = Math.min(playerStore.duration, Math.max(0, time))
  if (playerStore.usesLiveTranscode && playerStore.liveStreamSeekHandler) {
    playerStore.liveStreamSeekHandler(clamped)
    playerStore.currentTime = clamped
    return
  }
  if (playerStore.player) playerStore.player.currentTime = clamped
  playerStore.currentTime = clamped
}

async function refreshThumb(markId: number) {
  const playerStore = usePlayerStore()
  const appStore = useAppStore()
  const eventBus = useEventBus()

  try {
    await typedApi.createMarkThumb({
      markId,
      mediaId: Number(playerStore.media?.id),
      overwrite: true,
    })
    if (appStore.mediaPath) {
      invalidateFileExistsCache(getMarkImagePath(appStore.mediaPath, markId))
    }
    eventBus.emit('updateMarkImage', markId)
  } catch (thumbError) {
    console.warn('Failed refreshing mark thumb after studio drag', thumbError)
  }
}

async function commitDraft(
  id: number,
  draft: { time: number; end: number | null },
  previous: { time: number; end: number | null },
) {
  const playerStore = usePlayerStore()
  const mark = playerStore.marks.find((item) => item.id === id)
  if (!mark) return

  const timeChanged = Math.round(previous.time * 100) !== Math.round(draft.time * 100)
  const endChanged = (previous.end ?? null) !== (draft.end ?? null)
  if (!timeChanged && !endChanged) return

  mark.time = draft.time
  mark.end = draft.end

  try {
    await typedApi.updateMark(id, { time: draft.time, end: draft.end })
    if (timeChanged) await refreshThumb(id)
  } catch (e) {
    mark.time = previous.time
    mark.end = previous.end
    console.error(e)
  }
}

function openInspector(mark: PlayerMark) {
  if (mark.id == null) return
  const dialogsStore = useDialogsStore()
  if (dialogsStore.markAdding.show && Number(dialogsStore.markAdding.editId) === mark.id) return
  dialogsStore.openMarkEditing(mark)
}

function onPointerMove(event: PointerEvent) {
  const playerStore = usePlayerStore()
  const dialogsStore = useDialogsStore()

  if (addingDragMode != null) {
    const duration = playerStore.duration
    const deltaTime = pxToMarkTime(event.clientX - addingStartClientX, addingControlsWidthAtStart, duration)
    const excludeId = Number(dialogsStore.markAdding.editId) || -1
    const draft = computeMarkDragDraft({
      mode: addingDragMode,
      startTime: addingStartTime,
      startEnd: addingStartEnd,
      deltaTime,
      duration,
      targets: collectMarkSnapTargets(playerStore.marks, snapPlayheadAtStart, excludeId),
    })
    dialogsStore.markAdding.time = draft.time
    if (draft.end != null) {
      dialogsStore.markAdding.end = draft.end
      dialogsStore.markAdding.is_end_time_active = true
    }
    playerStore.studioSnapTime = draft.snapTime
    scheduleScrub(addingDragMode === 'resize-end' ? (draft.end ?? draft.time) : draft.time)
    return
  }

  if (createTrackRect) {
    const duration = playerStore.duration
    if (!createMoved && Math.abs(event.clientX - createStartClientX) > MARK_DRAG_THRESHOLD_PX) {
      createMoved = true
    }
    if (!createMoved) return

    const currentTime = timeFromTrackClientX(event.clientX, createTrackRect, duration)
    const rangeStart = Math.min(createStartTime, currentTime)
    let rangeEnd = Math.max(createStartTime, currentTime)
    if (rangeEnd - rangeStart < MIN_MARK_DURATION) {
      rangeEnd = Math.min(duration, rangeStart + MIN_MARK_DURATION)
    }
    playerStore.creatingMarkDraft = {
      time: Math.max(0, rangeStart),
      end: Math.min(duration, rangeEnd),
    }
    return
  }

  if (dragMarkId == null || dragMode == null) return

  if (!dragMoved && Math.abs(event.clientX - startClientX) > MARK_DRAG_THRESHOLD_PX) {
    dragMoved = true
  }
  if (!dragMoved && dragMode === 'move') return

  const duration = playerStore.duration
  const deltaTime = pxToMarkTime(event.clientX - startClientX, controlsWidthAtStart, duration)
  const draft = computeMarkDragDraft({
    mode: dragMode,
    startTime,
    startEnd,
    deltaTime,
    duration,
    targets: collectMarkSnapTargets(playerStore.marks, snapPlayheadAtStart, dragMarkId),
  })

  playerStore.markDraft = { id: dragMarkId, time: draft.time, end: draft.end }
  playerStore.studioSnapTime = draft.snapTime
  scheduleScrub(dragMode === 'resize-end' ? (draft.end ?? draft.time) : draft.time)
}

function finishAddingDrag() {
  addingDragMode = null
  usePlayerStore().studioSnapTime = null
}

async function createRangeMark(time: number, end: number) {
  const playerStore = usePlayerStore()
  const mediaId = playerStore.media?.id
  if (mediaId == null) return

  try {
    const res = await typedApi.createMark({
      type: 'bookmark',
      time,
      end,
      mediaId: Number(mediaId),
      tagId: null,
      text: null,
      icon: DEFAULT_BOOKMARK_ICON,
    })
    const created = res.data as PlayerMark
    playerStore.marks.push(created)
    if (created.id == null) return
    playerStore.selectedMarkId = created.id
    useDialogsStore().openMarkEditing(created)
    await refreshThumb(created.id)
  } catch (e) {
    console.error(e)
  }
}

function finishCreateDrag() {
  const playerStore = usePlayerStore()
  const dialogsStore = useDialogsStore()
  const draft = playerStore.creatingMarkDraft
  const moved = createMoved
  createTrackRect = null
  createMoved = false
  playerStore.creatingMarkDraft = null
  playerStore.studioSnapTime = null

  if (moved && draft) {
    void createRangeMark(draft.time, draft.end)
    return
  }

  playerStore.selectedMarkId = null
  const time = draft?.time ?? playerStore.currentTime
  dialogsStore.openMarkAdding({ time })
}

function finishMarkDrag() {
  const playerStore = usePlayerStore()
  const id = dragMarkId
  const draft = playerStore.markDraft
  const moved = dragMoved
  const mode = dragMode
  const previous = { time: previousTime, end: previousEnd }
  dragMarkId = null
  dragMode = null
  dragMoved = false
  playerStore.markDraft = null
  playerStore.studioSnapTime = null

  if (id == null) return

  playerStore.selectedMarkId = id
  const mark = playerStore.marks.find((item) => item.id === id)

  if (!moved && mode === 'move' && mark) {
    openInspector(mark)
    return
  }

  if (moved && draft) {
    void commitDraft(id, draft, previous)
  }
}

function onPointerUp() {
  detachWindowListeners()
  if (addingDragMode != null) {
    finishAddingDrag()
    return
  }
  if (createTrackRect) {
    finishCreateDrag()
    return
  }
  finishMarkDrag()
}

export function usePlayerMarkStudio() {
  const playerStore = usePlayerStore()
  const dialogsStore = useDialogsStore()

  const startDrag = (mark: PlayerMark, mode: MarkDragMode, event: PointerEvent, controlsWidth: number) => {
    if (mark.id == null) return

    event.preventDefault()
    event.stopPropagation()

    dragMarkId = mark.id
    dragMode = mode
    startClientX = event.clientX
    startTime = mark.time
    startEnd = mark.end ?? null
    previousTime = mark.time
    previousEnd = mark.end ?? null
    controlsWidthAtStart = controlsWidth
    dragMoved = mode !== 'move'
    snapPlayheadAtStart = playerStore.currentTime
    playerStore.selectedMarkId = mark.id
    playerStore.markDraft = { id: mark.id, time: startTime, end: startEnd }

    attachWindowListeners()
  }

  const startCreateDrag = (event: PointerEvent, trackEl: HTMLElement) => {
    if (event.button !== 0) return

    createStartClientX = event.clientX
    createTrackRect = trackEl.getBoundingClientRect()
    createStartTime = timeFromTrackClientX(event.clientX, createTrackRect, playerStore.duration)
    createMoved = false

    attachWindowListeners()
  }

  const startAddingDrag = (mode: MarkDragMode, event: PointerEvent, controlsWidth: number) => {
    if (event.button !== 0) return

    event.preventDefault()
    event.stopPropagation()

    const adding = dialogsStore.markAdding
    const hasEnd = Boolean(adding.is_end_time_active && adding.end != null)

    addingDragMode = mode
    addingStartClientX = event.clientX
    addingStartTime = normalizeMarkTime(adding.time)
    addingStartEnd = hasEnd ? normalizeMarkTime(adding.end) : null
    addingControlsWidthAtStart = controlsWidth
    snapPlayheadAtStart = playerStore.currentTime

    attachWindowListeners()
  }

  const nudgeSelectedMark = (event: WheelEvent) => {
    const id = playerStore.selectedMarkId
    if (id == null) return false

    const mark = playerStore.marks.find((item) => item.id === id)
    if (!mark) return false

    preventWheelDefault(event)
    const delta = getMarkRangeDeltaFromWheel(event)
    if (!delta) return true

    const current = playerStore.markDraft?.id === id
      ? playerStore.markDraft
      : { time: mark.time, end: mark.end ?? null }

    if (!wheelCommitTimer) {
      wheelOriginTime = current.time
      wheelOriginEnd = current.end
    }

    const next = computeMarkWheelNudge({
      time: current.time,
      end: current.end,
      delta,
      shiftKey: event.shiftKey,
      duration: playerStore.duration,
    })

    playerStore.markDraft = { id, time: next.time, end: next.end }
    mark.time = next.time
    mark.end = next.end
    scheduleScrub(event.shiftKey ? (next.end ?? next.time) : next.time)

    if (wheelCommitTimer) clearTimeout(wheelCommitTimer)
    wheelCommitTimer = setTimeout(() => {
      wheelCommitTimer = null
      playerStore.markDraft = null
      void commitDraft(id, next, { time: wheelOriginTime, end: wheelOriginEnd })
    }, 280)

    return true
  }

  return {
    startDrag,
    startCreateDrag,
    startAddingDrag,
    nudgeSelectedMark,
    dispose: disposePlayerMarkStudio,
    openInspector,
  }
}
