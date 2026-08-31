/**
 * Touch gestures for the in-app player surface (LAN / PWA / phone).
 * - Horizontal swipe → previous / next playlist item
 * - Double-tap left / right half → seek backward / forward
 * Mouse keeps click = pause and double-click = fullscreen.
 */

export const PLAYER_GESTURE_SWIPE_THRESHOLD_PX = 56
export const PLAYER_GESTURE_SWIPE_HORIZONTAL_BIAS = 1.2
export const PLAYER_GESTURE_TAP_SLOP_PX = 12
export const PLAYER_GESTURE_DOUBLE_TAP_MS = 280
export const PLAYER_GESTURE_DOUBLE_TAP_SLOP_PX = 48

export type PlayerGestureAction =
  | {type: 'prev'}
  | {type: 'next'}
  | {type: 'seek'; deltaSeconds: number}
  | {type: 'togglePause'}
  | {type: 'toggleFullscreen'}

export type PlayerGestureHandlers = {
  onPointerDown: (event: PointerEvent) => void
  onPointerMove: (event: PointerEvent) => void
  onPointerUp: (event: PointerEvent) => void
  onPointerCancel: (event: PointerEvent) => void
  onClick: (event: MouseEvent) => void
  onDblClick: (event: MouseEvent) => void
  dispose: () => void
}

export type PlayerSurfaceGestureOptions = {
  seekStepSeconds: number
  swipeThresholdPx?: number
  swipeHorizontalBias?: number
  tapSlopPx?: number
  doubleTapMs?: number
  doubleTapSlopPx?: number
  /** Return the video surface element used for hit-testing (left/right halves). */
  getSurfaceEl: () => HTMLElement | null
  /** True when the event target should not start a gesture (controls, buttons, …). */
  isIgnoredTarget?: (target: EventTarget | null) => boolean
  onAction: (action: PlayerGestureAction) => void
  /** Optional clock for tests. */
  now?: () => number
  /** Optional timer hooks for tests. */
  schedule?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>
  cancelSchedule?: (id: ReturnType<typeof setTimeout>) => void
}

function defaultIsIgnoredTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(
    target.closest(
      '.controls, .controls-inner, .player-close-btn, .video-error, .reg-block, button, a, input, textarea, select, [role="slider"], [data-ignore-player-gestures]',
    ),
  )
}

type ActivePointer = {
  id: number
  pointerType: string
  startX: number
  startY: number
  x: number
  y: number
  moved: boolean
}

type PendingTap = {
  x: number
  y: number
  at: number
  half: 'left' | 'right'
  timer: ReturnType<typeof setTimeout>
}

/**
 * Pure helpers exported for unit tests.
 */
export function resolveSwipeDirection(
  dx: number,
  dy: number,
  {
    thresholdPx = PLAYER_GESTURE_SWIPE_THRESHOLD_PX,
    horizontalBias = PLAYER_GESTURE_SWIPE_HORIZONTAL_BIAS,
  }: {thresholdPx?: number; horizontalBias?: number} = {},
): 'prev' | 'next' | null {
  if (Math.abs(dx) < thresholdPx) return null
  if (Math.abs(dx) <= Math.abs(dy) * horizontalBias) return null
  // Swipe left → next (content moves left); swipe right → previous.
  return dx < 0 ? 'next' : 'prev'
}

export function resolveTapHalf(
  clientX: number,
  surface: Pick<DOMRect, 'left' | 'width'> | null,
): 'left' | 'right' | null {
  if (!surface || surface.width <= 0) return null
  const ratio = (clientX - surface.left) / surface.width
  if (ratio < 0 || ratio > 1) return null
  return ratio < 0.5 ? 'left' : 'right'
}

export function createPlayerSurfaceGestureHandlers(
  options: PlayerSurfaceGestureOptions,
): PlayerGestureHandlers {
  const swipeThresholdPx = options.swipeThresholdPx ?? PLAYER_GESTURE_SWIPE_THRESHOLD_PX
  const swipeHorizontalBias = options.swipeHorizontalBias ?? PLAYER_GESTURE_SWIPE_HORIZONTAL_BIAS
  const tapSlopPx = options.tapSlopPx ?? PLAYER_GESTURE_TAP_SLOP_PX
  const doubleTapMs = options.doubleTapMs ?? PLAYER_GESTURE_DOUBLE_TAP_MS
  const doubleTapSlopPx = options.doubleTapSlopPx ?? PLAYER_GESTURE_DOUBLE_TAP_SLOP_PX
  const isIgnoredTarget = options.isIgnoredTarget ?? defaultIsIgnoredTarget
  const now = options.now ?? (() => Date.now())
  const schedule = options.schedule ?? ((fn, ms) => setTimeout(fn, ms))
  const cancelSchedule = options.cancelSchedule ?? ((id) => clearTimeout(id))

  const pointers = new Map<number, ActivePointer>()
  let pendingTap: PendingTap | null = null
  let suppressClick = false
  let lastTouchAt = 0

  const clearPendingTap = () => {
    if (!pendingTap) return
    cancelSchedule(pendingTap.timer)
    pendingTap = null
  }

  const markSuppressClick = () => {
    suppressClick = true
    // Clear on next macrotask so the synthesized click after pointerup is ignored.
    schedule(() => {
      suppressClick = false
    }, 0)
  }

  const surfaceRect = () => options.getSurfaceEl()?.getBoundingClientRect() ?? null

  const onPointerDown = (event: PointerEvent) => {
    if (isIgnoredTarget(event.target)) return
    if (event.pointerType === 'mouse' && event.button !== 0) return

    pointers.set(event.pointerId, {
      id: event.pointerId,
      pointerType: event.pointerType,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    })

    if (event.pointerType === 'touch' || event.pointerType === 'pen') {
      lastTouchAt = now()
      const surface = options.getSurfaceEl()
      try {
        surface?.setPointerCapture?.(event.pointerId)
      } catch {
        // ignore capture failures
      }
    }

    // Multi-touch cancels in-progress tap / swipe recognition.
    if (pointers.size > 1) {
      clearPendingTap()
    }
  }

  const onPointerMove = (event: PointerEvent) => {
    const active = pointers.get(event.pointerId)
    if (!active) return
    active.x = event.clientX
    active.y = event.clientY
    const dx = active.x - active.startX
    const dy = active.y - active.startY
    if (Math.abs(dx) > tapSlopPx || Math.abs(dy) > tapSlopPx) {
      active.moved = true
      // Moving cancels a waiting single-tap so swipe doesn't also pause.
      if (active.pointerType !== 'mouse') clearPendingTap()
    }
  }

  const finishPointer = (event: PointerEvent, cancelled: boolean) => {
    const active = pointers.get(event.pointerId)
    if (!active) return
    pointers.delete(event.pointerId)

    const surface = options.getSurfaceEl()
    try {
      if (surface?.hasPointerCapture?.(event.pointerId)) {
        surface.releasePointerCapture(event.pointerId)
      }
    } catch {
      // ignore release failures
    }

    if (cancelled) {
      clearPendingTap()
      return
    }

    // Only one finger / pen for gestures.
    if (pointers.size > 0) return

    const isTouchLike = active.pointerType === 'touch' || active.pointerType === 'pen'
    if (!isTouchLike) return

    const dx = active.x - active.startX
    const dy = active.y - active.startY

    if (active.moved) {
      const direction = resolveSwipeDirection(dx, dy, {
        thresholdPx: swipeThresholdPx,
        horizontalBias: swipeHorizontalBias,
      })
      if (direction) {
        clearPendingTap()
        markSuppressClick()
        options.onAction({type: direction})
      }
      return
    }

    const half = resolveTapHalf(active.startX, surfaceRect())
    if (!half) return

    const tapNow = now()
    if (
      pendingTap
      && tapNow - pendingTap.at <= doubleTapMs
      && pendingTap.half === half
      && Math.hypot(active.startX - pendingTap.x, active.startY - pendingTap.y) <= doubleTapSlopPx
    ) {
      clearPendingTap()
      markSuppressClick()
      const deltaSeconds = half === 'left'
        ? -Math.abs(options.seekStepSeconds)
        : Math.abs(options.seekStepSeconds)
      options.onAction({type: 'seek', deltaSeconds})
      return
    }

    clearPendingTap()
    pendingTap = {
      x: active.startX,
      y: active.startY,
      at: tapNow,
      half,
      timer: schedule(() => {
        pendingTap = null
        markSuppressClick()
        options.onAction({type: 'togglePause'})
      }, doubleTapMs),
    }
  }

  const onPointerUp = (event: PointerEvent) => {
    finishPointer(event, false)
  }

  const onPointerCancel = (event: PointerEvent) => {
    finishPointer(event, true)
  }

  const onClick = (event: MouseEvent) => {
    if (suppressClick) {
      event.preventDefault()
      event.stopPropagation()
      suppressClick = false
      return
    }
    // Synthesized clicks after touch are handled via the delayed tap path.
    if (event.detail === 0) return
    if (now() - lastTouchAt < doubleTapMs + 50) return
    if (isIgnoredTarget(event.target)) return
    options.onAction({type: 'togglePause'})
  }

  const onDblClick = (event: MouseEvent) => {
    if (suppressClick) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (now() - lastTouchAt < doubleTapMs + 50) return
    if (isIgnoredTarget(event.target)) return
    options.onAction({type: 'toggleFullscreen'})
  }

  const dispose = () => {
    clearPendingTap()
    pointers.clear()
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onClick,
    onDblClick,
    dispose,
  }
}
