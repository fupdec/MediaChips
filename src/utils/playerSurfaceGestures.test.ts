import {describe, expect, it, vi} from 'vitest'
import {
  createPlayerSurfaceGestureHandlers,
  resolveSwipeDirection,
  resolveTapHalf,
  PLAYER_GESTURE_DOUBLE_TAP_MS,
  PLAYER_GESTURE_SWIPE_THRESHOLD_PX,
} from '@/utils/playerSurfaceGestures'

describe('resolveSwipeDirection', () => {
  it('maps left swipe to next and right swipe to prev', () => {
    expect(resolveSwipeDirection(-80, 5)).toBe('next')
    expect(resolveSwipeDirection(80, -5)).toBe('prev')
  })

  it('ignores short or mostly-vertical swipes', () => {
    expect(resolveSwipeDirection(-40, 0)).toBeNull()
    expect(resolveSwipeDirection(-80, 90)).toBeNull()
  })
})

describe('resolveTapHalf', () => {
  it('splits the surface into left and right halves', () => {
    const surface = {left: 100, width: 200}
    expect(resolveTapHalf(120, surface)).toBe('left')
    expect(resolveTapHalf(220, surface)).toBe('right')
    expect(resolveTapHalf(50, surface)).toBeNull()
  })
})

describe('createPlayerSurfaceGestureHandlers', () => {
  function makeSurface() {
    const el = document.createElement('div')
    el.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 300,
      bottom: 200,
      width: 300,
      height: 200,
      x: 0,
      y: 0,
      toJSON() { return {} },
    })
    return el
  }

  function pointerEvent(
    type: string,
    init: Partial<PointerEvent> & {clientX: number; clientY: number},
  ): PointerEvent {
    return new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: 'touch',
      button: 0,
      buttons: 1,
      ...init,
    })
  }

  it('emits next/prev after a horizontal swipe', () => {
    const actions: string[] = []
    const surface = makeSurface()
    const handlers = createPlayerSurfaceGestureHandlers({
      seekStepSeconds: 10,
      getSurfaceEl: () => surface,
      onAction: (action) => actions.push(action.type),
    })

    handlers.onPointerDown(pointerEvent('pointerdown', {clientX: 200, clientY: 100}))
    handlers.onPointerMove(pointerEvent('pointermove', {clientX: 200 - PLAYER_GESTURE_SWIPE_THRESHOLD_PX - 10, clientY: 102}))
    handlers.onPointerUp(pointerEvent('pointerup', {clientX: 200 - PLAYER_GESTURE_SWIPE_THRESHOLD_PX - 10, clientY: 102}))

    expect(actions).toEqual(['next'])
    handlers.dispose()
  })

  it('double-taps left/right halves to seek', () => {
    vi.useFakeTimers()
    const actions: Array<{type: string; deltaSeconds?: number}> = []
    const surface = makeSurface()
    let t = 1_000
    const handlers = createPlayerSurfaceGestureHandlers({
      seekStepSeconds: 10,
      getSurfaceEl: () => surface,
      now: () => t,
      schedule: (fn, ms) => setTimeout(fn, ms),
      cancelSchedule: (id) => clearTimeout(id),
      onAction: (action) => {
        if (action.type === 'seek') actions.push(action)
        else actions.push({type: action.type})
      },
    })

    handlers.onPointerDown(pointerEvent('pointerdown', {clientX: 40, clientY: 80}))
    handlers.onPointerUp(pointerEvent('pointerup', {clientX: 40, clientY: 80}))
    t += 100
    handlers.onPointerDown(pointerEvent('pointerdown', {clientX: 44, clientY: 82}))
    handlers.onPointerUp(pointerEvent('pointerup', {clientX: 44, clientY: 82}))

    expect(actions).toEqual([{type: 'seek', deltaSeconds: -10}])

    t += 400
    handlers.onPointerDown(pointerEvent('pointerdown', {clientX: 260, clientY: 80}))
    handlers.onPointerUp(pointerEvent('pointerup', {clientX: 260, clientY: 80}))
    t += 100
    handlers.onPointerDown(pointerEvent('pointerdown', {clientX: 250, clientY: 85}))
    handlers.onPointerUp(pointerEvent('pointerup', {clientX: 250, clientY: 85}))

    expect(actions).toEqual([
      {type: 'seek', deltaSeconds: -10},
      {type: 'seek', deltaSeconds: 10},
    ])

    handlers.dispose()
    vi.useRealTimers()
  })

  it('fires togglePause for a single tap after the double-tap window', () => {
    vi.useFakeTimers()
    const actions: string[] = []
    const surface = makeSurface()
    let t = 5_000
    const handlers = createPlayerSurfaceGestureHandlers({
      seekStepSeconds: 10,
      getSurfaceEl: () => surface,
      now: () => t,
      schedule: (fn, ms) => setTimeout(fn, ms),
      cancelSchedule: (id) => clearTimeout(id),
      onAction: (action) => actions.push(action.type),
    })

    handlers.onPointerDown(pointerEvent('pointerdown', {clientX: 150, clientY: 100}))
    handlers.onPointerUp(pointerEvent('pointerup', {clientX: 150, clientY: 100}))
    expect(actions).toEqual([])

    vi.advanceTimersByTime(PLAYER_GESTURE_DOUBLE_TAP_MS + 1)
    expect(actions).toEqual(['togglePause'])

    handlers.dispose()
    vi.useRealTimers()
  })

  it('ignores targets inside player controls', () => {
    const actions: string[] = []
    const surface = makeSurface()
    const controls = document.createElement('div')
    controls.className = 'controls'
    const button = document.createElement('button')
    controls.appendChild(button)

    const handlers = createPlayerSurfaceGestureHandlers({
      seekStepSeconds: 10,
      getSurfaceEl: () => surface,
      onAction: (action) => actions.push(action.type),
    })

    const down = pointerEvent('pointerdown', {clientX: 20, clientY: 20})
    Object.defineProperty(down, 'target', {value: button})
    handlers.onPointerDown(down)
    handlers.onPointerUp(pointerEvent('pointerup', {clientX: 20, clientY: 20}))
    expect(actions).toEqual([])
    handlers.dispose()
  })
})
