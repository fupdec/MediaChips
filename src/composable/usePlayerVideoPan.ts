import {onBeforeUnmount, ref, type Ref} from 'vue'
import type {usePlayerStore} from '@/stores/player'
import {defaultIsIgnoredTarget} from '@/utils/playerSurfaceGestures'
import {clampPan, pinchTransform, type PinchStart} from '@/utils/playerZoom'

const DRAG_SLOP_PX = 4

type Point = { x: number; y: number }

/**
 * Moving a zoomed picture and pinch-zoom.
 * - Mouse: drag with the left button. A drag must not end in the click that toggles pause,
 *   so the click right after a drag is swallowed (capture phase, before the surface click handler).
 * - Touch: one finger drags a zoomed picture, two fingers zoom and move it at the same time.
 */
export function usePlayerVideoPan(
  playerStore: ReturnType<typeof usePlayerStore>,
  size: Ref<{ width: number; height: number }>,
) {
  const panning = ref(false)
  let drag: { id: number; startX: number; startY: number; panX: number; panY: number; moved: boolean } | null = null
  const touches = new Map<number, Point>()
  let pinch: PinchStart | null = null
  let center: Point = {x: 0, y: 0}
  let suppressClick = false
  let suppressTimer: ReturnType<typeof setTimeout> | null = null

  const currentPan = () => clampPan({x: playerStore.panX, y: playerStore.panY}, playerStore.zoom, size.value)

  const pinchMetrics = () => {
    const [a, b] = [...touches.values()]
    return {
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      mid: {x: (a.x + b.x) / 2 - center.x, y: (a.y + b.y) / 2 - center.y},
    }
  }

  const startPinch = () => {
    drag = null
    const {distance, mid} = pinchMetrics()
    pinch = {zoom: playerStore.zoom, pan: currentPan(), distance, mid}
    panning.value = true
  }

  const startTouchDrag = (id: number, point: Point) => {
    const pan = currentPan()
    drag = {id, startX: point.x, startY: point.y, panX: pan.x, panY: pan.y, moved: false}
  }

  const onWindowMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch' && touches.has(event.pointerId)) {
      touches.set(event.pointerId, {x: event.clientX, y: event.clientY})
      if (pinch && touches.size >= 2) {
        const result = pinchTransform(pinch, pinchMetrics(), size.value)
        playerStore.zoom = result.zoom
        playerStore.panX = result.pan.x
        playerStore.panY = result.pan.y
        return
      }
    }
    if (!drag || event.pointerId !== drag.id) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.moved && Math.hypot(dx, dy) <= DRAG_SLOP_PX) return
    drag.moved = true
    panning.value = true
    const pan = clampPan({x: drag.panX + dx, y: drag.panY + dy}, playerStore.zoom, size.value)
    playerStore.panX = pan.x
    playerStore.panY = pan.y
  }

  const stopListening = () => {
    window.removeEventListener('pointermove', onWindowMove)
    window.removeEventListener('pointerup', onWindowEnd)
    window.removeEventListener('pointercancel', onWindowEnd)
  }

  function onWindowEnd(event: PointerEvent) {
    if (event.pointerType === 'touch' && touches.delete(event.pointerId)) {
      if (pinch) {
        // One finger left after a pinch: it may keep dragging the picture from where it is now.
        pinch = null
        drag = null
        const rest = [...touches.entries()][0]
        if (rest && playerStore.zoom > 1) startTouchDrag(rest[0], rest[1])
        panning.value = false
      }
      if (touches.size === 0) {
        drag = null
        panning.value = false
        stopListening()
      }
      if (drag?.id === event.pointerId) drag = null
      return
    }
    if (!drag || event.pointerId !== drag.id) return
    if (drag.moved) {
      suppressClick = true
      if (suppressTimer) clearTimeout(suppressTimer)
      suppressTimer = setTimeout(() => { suppressClick = false }, 50)
    }
    drag = null
    panning.value = false
    stopListening()
  }

  const listen = () => {
    window.addEventListener('pointermove', onWindowMove)
    window.addEventListener('pointerup', onWindowEnd)
    window.addEventListener('pointercancel', onWindowEnd)
  }

  const onPointerDown = (event: PointerEvent) => {
    if (defaultIsIgnoredTarget(event.target)) return

    if (event.pointerType === 'touch') {
      if (touches.size >= 2) return
      const rect = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect?.()
      if (touches.size === 0) {
        center = rect ? {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2} : {x: 0, y: 0}
        listen()
      }
      touches.set(event.pointerId, {x: event.clientX, y: event.clientY})
      if (touches.size === 2) startPinch()
      else if (playerStore.zoom > 1) startTouchDrag(event.pointerId, {x: event.clientX, y: event.clientY})
      return
    }

    if (event.pointerType !== 'mouse' || event.button !== 0) return
    if (!(playerStore.zoom > 1)) return
    startTouchDrag(event.pointerId, {x: event.clientX, y: event.clientY})
    listen()
  }

  const onClickCapture = (event: MouseEvent) => {
    if (!suppressClick) return
    suppressClick = false
    event.preventDefault()
    event.stopPropagation()
  }

  onBeforeUnmount(() => {
    stopListening()
    touches.clear()
    if (suppressTimer) clearTimeout(suppressTimer)
  })

  return {panning, onPointerDown, onClickCapture}
}
