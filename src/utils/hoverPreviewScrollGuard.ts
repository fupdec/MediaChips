/** Suppress hover preview starts while the grid/page is scrolling. */

export const HOVER_PREVIEW_SCROLL_IDLE_MS = 180

export type HoverPreviewPointer = {clientX: number; clientY: number}

type ScrollIdleListener = (pointer: HoverPreviewPointer | null) => void

let scrollingUntil = 0
let idleTimer: ReturnType<typeof setTimeout> | undefined
let installed = false
let lastPointer: HoverPreviewPointer | null = null
const scrollIdleListeners = new Set<ScrollIdleListener>()

const onScrollActivity = () => {
  noteHoverPreviewScrollActivity()
}

const onPointerActivity = (event: Event) => {
  const e = event as PointerEvent | MouseEvent
  if (!Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return
  lastPointer = {clientX: e.clientX, clientY: e.clientY}
}

function notifyScrollIdleListeners(): void {
  const pointer = lastPointer
  for (const listener of [...scrollIdleListeners]) {
    try {
      listener(pointer)
    } catch {
      // Card unmounted mid-notify — ignore.
    }
  }
}

export function noteHoverPreviewScrollActivity(
  idleMs = HOVER_PREVIEW_SCROLL_IDLE_MS,
): void {
  scrollingUntil = Date.now() + idleMs
  clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    scrollingUntil = 0
    idleTimer = undefined
    // Cursor often sits on a thumb after scroll with no fresh mouseenter —
    // cards re-arm if they still sit under the pointer.
    notifyScrollIdleListeners()
  }, idleMs)
}

export function isHoverPreviewBlockedByScroll(): boolean {
  return Date.now() < scrollingUntil
}

export function getHoverPreviewLastPointer(): HoverPreviewPointer | null {
  return lastPointer
}

/**
 * Run when scrolling settles. Returns unsubscribe.
 * Used so the card under the cursor can start hover without a leave/re-enter.
 */
export function onHoverPreviewScrollIdle(listener: ScrollIdleListener): () => void {
  scrollIdleListeners.add(listener)
  return () => {
    scrollIdleListeners.delete(listener)
  }
}

/** Install once for the app lifetime (safe to call from every card mount). */
export function installHoverPreviewScrollGuard(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('scroll', onScrollActivity, {capture: true, passive: true})
  window.addEventListener('wheel', onScrollActivity, {capture: true, passive: true})
  window.addEventListener('touchmove', onScrollActivity, {capture: true, passive: true})
  // Keep last pointer for elementFromPoint after scroll (matches(':hover') is unreliable).
  window.addEventListener('pointermove', onPointerActivity, {capture: true, passive: true})
  window.addEventListener('mousemove', onPointerActivity, {capture: true, passive: true})
}

/** Reset for tests only. */
export function resetHoverPreviewScrollGuardForTests(): void {
  if (installed && typeof window !== 'undefined') {
    window.removeEventListener('scroll', onScrollActivity, true)
    window.removeEventListener('wheel', onScrollActivity, true)
    window.removeEventListener('touchmove', onScrollActivity, true)
    window.removeEventListener('pointermove', onPointerActivity, true)
    window.removeEventListener('mousemove', onPointerActivity, true)
  }
  clearTimeout(idleTimer)
  idleTimer = undefined
  scrollingUntil = 0
  lastPointer = null
  installed = false
  scrollIdleListeners.clear()
}
