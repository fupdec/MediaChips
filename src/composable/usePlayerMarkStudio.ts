import { ref } from 'vue'
import { usePlayerStore } from '@/stores/player'
import { useAppStore } from '@/stores/app'
import { useDialogsStore } from '@/stores/dialogs'
import { useEventBus } from '@/utils/eventBus'
import { typedApi } from '@/services/typedApi'
import { getMarkImagePath } from '@/utils/markThumb'
import { invalidateFileExistsCache } from '@/services/fileService'
import { normalizeMarkTime } from '@/utils/markAdding'
import { DEFAULT_BOOKMARK_ICON } from '@shared/markIcons'
import type { PlayerMark } from '@/types/player'

const MIN_DURATION = 0.5
const SNAP_SECONDS = 0.3

export type MarkDragMode = 'move' | 'resize-start' | 'resize-end'

export function usePlayerMarkStudio() {
  const playerStore = usePlayerStore()
  const appStore = useAppStore()
  const dialogsStore = useDialogsStore()
  const eventBus = useEventBus()

  const isDragging = ref(false)

  let dragMarkId: number | null = null
  let dragMode: MarkDragMode | null = null
  let startClientX = 0
  let startTime = 0
  let startEnd: number | null = null
  let controlsWidthAtStart = 0

  let createStartClientX = 0
  let createStartTime = 0
  let createTrackRect: DOMRect | null = null
  let createMoved = false

  let addingDragMode: MarkDragMode | null = null
  let addingStartClientX = 0
  let addingStartTime = 0
  let addingStartEnd: number | null = null
  let addingControlsWidthAtStart = 0

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

  const pxToTime = (px: number, controlsWidth: number) => {
    if (!controlsWidth || !playerStore.duration) return 0
    return px * playerStore.duration / controlsWidth
  }

  const timeFromClientX = (clientX: number, rect: DOMRect, duration: number) => {
    if (!rect.width || !duration) return 0
    const percent = clamp((clientX - rect.left) / rect.width, 0, 1)
    return percent * duration
  }

  const collectSnapTargets = (excludeId: number) => {
    const targets: number[] = [playerStore.currentTime]
    for (const mark of playerStore.marks) {
      if (mark.id === excludeId) continue
      targets.push(mark.time)
      if (mark.end != null) targets.push(mark.end)
    }
    return targets
  }

  const snapValue = (value: number, targets: number[]) => {
    let best = value
    let bestDiff = SNAP_SECONDS
    for (const target of targets) {
      const diff = Math.abs(target - value)
      if (diff < bestDiff) {
        bestDiff = diff
        best = target
      }
    }
    return best
  }

  const onPointerMove = (event: PointerEvent) => {
    if (dragMarkId == null || dragMode == null) return

    const duration = playerStore.duration
    const deltaTime = pxToTime(event.clientX - startClientX, controlsWidthAtStart)
    const targets = collectSnapTargets(dragMarkId)

    if (dragMode === 'move') {
      const span = startEnd != null ? startEnd - startTime : 0
      const nextTime = snapValue(clamp(startTime + deltaTime, 0, duration - span), targets)
      playerStore.markDraft = {
        id: dragMarkId,
        time: nextTime,
        end: startEnd != null ? nextTime + span : null,
      }
      return
    }

    if (dragMode === 'resize-start') {
      const maxStart = (startEnd ?? duration) - MIN_DURATION
      const nextTime = Math.min(snapValue(clamp(startTime + deltaTime, 0, maxStart), targets), maxStart)
      playerStore.markDraft = { id: dragMarkId, time: nextTime, end: startEnd }
      return
    }

    if (dragMode === 'resize-end') {
      const minEnd = startTime + MIN_DURATION
      const nextEnd = Math.max(snapValue(clamp((startEnd ?? startTime) + deltaTime, minEnd, duration), targets), minEnd)
      playerStore.markDraft = { id: dragMarkId, time: startTime, end: nextEnd }
    }
  }

  const commitDraft = async (id: number, draft: { time: number; end: number | null }) => {
    const mark = playerStore.marks.find((item) => item.id === id)
    if (!mark) return

    const timeChanged = Math.round(mark.time * 100) !== Math.round(draft.time * 100)
    const endChanged = (mark.end ?? null) !== (draft.end ?? null)
    if (!timeChanged && !endChanged) return

    mark.time = draft.time
    mark.end = draft.end

    try {
      await typedApi.updateMark(id, { time: draft.time, end: draft.end })

      if (timeChanged) {
        try {
          await typedApi.createMarkThumb({
            markId: id,
            mediaId: Number(playerStore.media?.id),
            overwrite: true,
          })
          if (appStore.mediaPath) {
            invalidateFileExistsCache(getMarkImagePath(appStore.mediaPath, id))
          }
          eventBus.emit('updateMarkImage', id)
        } catch (thumbError) {
          console.warn('Failed refreshing mark thumb after studio drag', thumbError)
        }
      }
    } catch (e) {
      console.error(e)
    }
  }

  const onPointerUp = () => {
    window.removeEventListener('pointermove', onPointerMove)

    const id = dragMarkId
    const draft = playerStore.markDraft
    dragMarkId = null
    dragMode = null
    isDragging.value = false
    playerStore.markDraft = null

    if (id == null || !draft) return
    void commitDraft(id, draft)
  }

  const startDrag = (mark: PlayerMark, mode: MarkDragMode, event: PointerEvent, controlsWidth: number) => {
    if (mark.id == null) return

    event.preventDefault()
    event.stopPropagation()

    dragMarkId = mark.id
    dragMode = mode
    startClientX = event.clientX
    startTime = mark.time
    startEnd = mark.end ?? null
    controlsWidthAtStart = controlsWidth
    isDragging.value = true

    playerStore.selectedMarkId = mark.id
    playerStore.markDraft = { id: mark.id, time: startTime, end: startEnd }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp, { once: true })
  }

  const createRangeMark = async (time: number, end: number) => {
    const mediaId = playerStore.media?.id
    if (mediaId == null) return

    const payload = {
      type: 'bookmark',
      time,
      end,
      mediaId: Number(mediaId),
      tagId: null,
      text: null,
      icon: DEFAULT_BOOKMARK_ICON,
    }

    try {
      const res = await typedApi.createMark(payload)
      const created = res.data as PlayerMark
      playerStore.marks.push(created)

      if (created.id == null) return
      playerStore.selectedMarkId = created.id

      try {
        await typedApi.createMarkThumb({
          markId: created.id,
          mediaId: Number(mediaId),
          overwrite: true,
        })
        if (appStore.mediaPath) {
          invalidateFileExistsCache(getMarkImagePath(appStore.mediaPath, created.id))
        }
        eventBus.emit('updateMarkImage', created.id)
      } catch (thumbError) {
        console.warn('Failed generating thumb for studio-created mark', thumbError)
      }
    } catch (e) {
      console.error(e)
    }
  }

  const onCreatePointerMove = (event: PointerEvent) => {
    if (!createTrackRect) return

    const duration = playerStore.duration
    if (!createMoved && Math.abs(event.clientX - createStartClientX) > 4) {
      createMoved = true
    }
    if (!createMoved) return

    const currentTime = timeFromClientX(event.clientX, createTrackRect, duration)
    const rangeStart = clamp(Math.min(createStartTime, currentTime), 0, duration)
    let rangeEnd = clamp(Math.max(createStartTime, currentTime), 0, duration)
    if (rangeEnd - rangeStart < MIN_DURATION) {
      rangeEnd = Math.min(duration, rangeStart + MIN_DURATION)
    }

    playerStore.creatingMarkDraft = { time: rangeStart, end: rangeEnd }
  }

  const onCreatePointerUp = () => {
    window.removeEventListener('pointermove', onCreatePointerMove)

    const draft = playerStore.creatingMarkDraft
    const moved = createMoved
    createTrackRect = null
    createMoved = false
    playerStore.creatingMarkDraft = null

    if (moved && draft) {
      void createRangeMark(draft.time, draft.end)
    } else {
      playerStore.selectedMarkId = null
    }
  }

  const startCreateDrag = (event: PointerEvent, trackEl: HTMLElement) => {
    if (event.button !== 0) return

    createStartClientX = event.clientX
    createTrackRect = trackEl.getBoundingClientRect()
    createStartTime = timeFromClientX(event.clientX, createTrackRect, playerStore.duration)
    createMoved = false

    window.addEventListener('pointermove', onCreatePointerMove)
    window.addEventListener('pointerup', onCreatePointerUp, { once: true })
  }

  const onAddingPointerMove = (event: PointerEvent) => {
    if (addingDragMode == null) return

    const duration = playerStore.duration
    const deltaTime = pxToTime(event.clientX - addingStartClientX, addingControlsWidthAtStart)
    const excludeId = Number(dialogsStore.markAdding.editId) || -1
    const targets = collectSnapTargets(excludeId)

    if (addingDragMode === 'move') {
      const span = addingStartEnd != null ? addingStartEnd - addingStartTime : 0
      const nextTime = snapValue(clamp(addingStartTime + deltaTime, 0, duration - span), targets)
      dialogsStore.markAdding.time = nextTime
      if (addingStartEnd != null) {
        dialogsStore.markAdding.end = nextTime + span
      }
      return
    }

    if (addingDragMode === 'resize-start') {
      const maxStart = (addingStartEnd ?? duration) - MIN_DURATION
      const nextTime = Math.min(snapValue(clamp(addingStartTime + deltaTime, 0, maxStart), targets), maxStart)
      dialogsStore.markAdding.time = nextTime
      return
    }

    if (addingDragMode === 'resize-end') {
      const minEnd = addingStartTime + MIN_DURATION
      const nextEnd = Math.max(snapValue(clamp((addingStartEnd ?? addingStartTime) + deltaTime, minEnd, duration), targets), minEnd)
      dialogsStore.markAdding.end = nextEnd
    }
  }

  const onAddingPointerUp = () => {
    window.removeEventListener('pointermove', onAddingPointerMove)
    addingDragMode = null
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

    window.addEventListener('pointermove', onAddingPointerMove)
    window.addEventListener('pointerup', onAddingPointerUp, { once: true })
  }

  return {
    isDragging,
    startDrag,
    startCreateDrag,
    startAddingDrag,
  }
}
