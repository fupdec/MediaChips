import {computed, onUnmounted, ref, type Ref} from 'vue'

const DISMISS_PX = 96
const MAX_OFFSET_PX = 420
const WHEEL_SETTLE_MS = 140

let overscrollLockCount = 0

function lockDocumentOverscroll() {
  if (typeof document === 'undefined') return
  overscrollLockCount += 1
  if (overscrollLockCount === 1) {
    document.documentElement.style.overscrollBehaviorX = 'none'
    document.body.style.overscrollBehaviorX = 'none'
  }
}

function unlockDocumentOverscroll() {
  if (typeof document === 'undefined') return
  overscrollLockCount = Math.max(0, overscrollLockCount - 1)
  if (overscrollLockCount === 0) {
    document.documentElement.style.overscrollBehaviorX = ''
    document.body.style.overscrollBehaviorX = ''
  }
}

export function useSwipeToDismiss(onDismiss: () => void) {
  const offsetX = ref(0)
  const isDragging = ref(false)
  const dismissing = ref(false)

  let dragPointerId: number | null = null
  let dragStartX = 0
  let dragOriginOffset = 0
  let wheelSettleTimer: ReturnType<typeof setTimeout> | null = null
  let wheelEl: HTMLElement | null = null
  let overscrollLocked = false

  const swipeStyle = computed(() => {
    // Idle: no inline transform/opacity so CSS leave/enter transitions can run.
    if (!isDragging.value && offsetX.value === 0 && !dismissing.value) {
      return undefined
    }
    return {
      transform: `translateX(${offsetX.value}px)`,
      opacity: String(Math.max(0.2, 1 - offsetX.value / (DISMISS_PX * 1.6))),
    }
  })

  const swipeClass = computed(() => ({
    'swipe-dismiss--swiping': isDragging.value,
    'swipe-dismiss--active': offsetX.value > 0,
  }))

  const acquireOverscrollLock = () => {
    if (overscrollLocked) return
    overscrollLocked = true
    lockDocumentOverscroll()
  }

  const releaseOverscrollLock = () => {
    if (!overscrollLocked) return
    overscrollLocked = false
    unlockDocumentOverscroll()
  }

  const snapBack = () => {
    offsetX.value = 0
    releaseOverscrollLock()
  }

  const reset = () => {
    dismissing.value = false
    isDragging.value = false
    dragPointerId = null
    snapBack()
  }

  const dismiss = () => {
    if (dismissing.value) return
    dismissing.value = true
    acquireOverscrollLock()
    offsetX.value = MAX_OFFSET_PX
    window.setTimeout(() => {
      onDismiss()
      releaseOverscrollLock()
    }, 160)
  }

  const finishDrag = (clientX: number) => {
    if (!isDragging.value) return
    isDragging.value = false
    dragPointerId = null
    const delta = clientX - dragStartX
    offsetX.value = Math.max(0, Math.min(MAX_OFFSET_PX, dragOriginOffset + delta))
    if (offsetX.value >= DISMISS_PX) {
      dismiss()
    } else {
      snapBack()
    }
  }

  const onPointerMove = (event: PointerEvent) => {
    if (!isDragging.value || event.pointerId !== dragPointerId) return
    const delta = event.clientX - dragStartX
    if (Math.abs(delta) > 4) {
      acquireOverscrollLock()
      // Stop Chrome/macOS from treating this trackpad/mouse gesture as history navigation.
      event.preventDefault()
    }
    offsetX.value = Math.max(0, Math.min(MAX_OFFSET_PX, dragOriginOffset + delta))
  }

  const onPointerUp = (event: PointerEvent) => {
    if (dragPointerId != null && event.pointerId !== dragPointerId) return
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerUp)
    finishDrag(event.clientX)
  }

  const onPointerDown = (event: PointerEvent) => {
    if (dismissing.value || event.button !== 0) return
    const target = event.target as HTMLElement | null
    if (target?.closest('button, a, .v-btn')) return

    dragPointerId = event.pointerId
    isDragging.value = true
    dragStartX = event.clientX
    dragOriginOffset = offsetX.value

    const el = event.currentTarget as HTMLElement | null
    el?.setPointerCapture?.(event.pointerId)
    window.addEventListener('pointermove', onPointerMove, {passive: false})
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
  }

  const onWheel = (event: WheelEvent) => {
    if (dismissing.value) return

    // Any meaningful horizontal intent: claim the gesture so Chrome won't navigate back/forward.
    if (Math.abs(event.deltaX) < 0.5) return
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) * 0.35) return

    event.preventDefault()
    event.stopPropagation()
    acquireOverscrollLock()

    // Natural scroll: fingers right → deltaX < 0 → card moves right.
    offsetX.value = Math.max(0, Math.min(MAX_OFFSET_PX, offsetX.value - event.deltaX))

    if (wheelSettleTimer) clearTimeout(wheelSettleTimer)

    if (offsetX.value >= DISMISS_PX) {
      dismiss()
      return
    }

    wheelSettleTimer = setTimeout(() => {
      wheelSettleTimer = null
      if (!dismissing.value && offsetX.value < DISMISS_PX) {
        snapBack()
      }
    }, WHEEL_SETTLE_MS)
  }

  const bindWheel = (el: HTMLElement | null) => {
    unbindWheel()
    wheelEl = el
    wheelEl?.addEventListener('wheel', onWheel, {passive: false})
  }

  const unbindWheel = () => {
    wheelEl?.removeEventListener('wheel', onWheel)
    wheelEl = null
  }

  const resolveEl = (target: Ref<{ $el?: HTMLElement } | HTMLElement | null>) => {
    const value = target.value
    if (!value) return null
    if (value instanceof HTMLElement) return value
    return value.$el || null
  }

  onUnmounted(() => {
    if (wheelSettleTimer) clearTimeout(wheelSettleTimer)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerUp)
    unbindWheel()
    releaseOverscrollLock()
  })

  return {
    offsetX,
    isDragging,
    dismissing,
    swipeStyle,
    swipeClass,
    onPointerDown,
    bindWheel,
    unbindWheel,
    resolveEl,
    snapBack,
    reset,
  }
}
