import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {
  HOVER_PREVIEW_SCROLL_IDLE_MS,
  installHoverPreviewScrollGuard,
  isHoverPreviewBlockedByScroll,
  noteHoverPreviewScrollActivity,
  onHoverPreviewScrollIdle,
  resetHoverPreviewScrollGuardForTests,
} from './hoverPreviewScrollGuard'

describe('hoverPreviewScrollGuard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetHoverPreviewScrollGuardForTests()
  })

  afterEach(() => {
    resetHoverPreviewScrollGuardForTests()
    vi.useRealTimers()
  })

  it('blocks hover briefly after scroll activity', () => {
    expect(isHoverPreviewBlockedByScroll()).toBe(false)
    noteHoverPreviewScrollActivity(200)
    expect(isHoverPreviewBlockedByScroll()).toBe(true)
    vi.advanceTimersByTime(199)
    expect(isHoverPreviewBlockedByScroll()).toBe(true)
    vi.advanceTimersByTime(2)
    expect(isHoverPreviewBlockedByScroll()).toBe(false)
  })

  it('extends the block when scroll continues', () => {
    noteHoverPreviewScrollActivity(100)
    vi.advanceTimersByTime(80)
    noteHoverPreviewScrollActivity(100)
    vi.advanceTimersByTime(80)
    expect(isHoverPreviewBlockedByScroll()).toBe(true)
    vi.advanceTimersByTime(30)
    expect(isHoverPreviewBlockedByScroll()).toBe(false)
  })

  it('installs capture listeners once', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')

    installHoverPreviewScrollGuard()
    installHoverPreviewScrollGuard()

    const scrollAdds = addSpy.mock.calls.filter((call) => call[0] === 'scroll')
    expect(scrollAdds).toHaveLength(1)
    expect(scrollAdds[0]?.[2]).toEqual({capture: true, passive: true})

    addSpy.mockRestore()
  })

  it('marks scrolling when the window fires wheel', () => {
    installHoverPreviewScrollGuard()
    window.dispatchEvent(new Event('wheel'))
    expect(isHoverPreviewBlockedByScroll()).toBe(true)
    vi.advanceTimersByTime(HOVER_PREVIEW_SCROLL_IDLE_MS + 1)
    expect(isHoverPreviewBlockedByScroll()).toBe(false)
  })

  it('notifies idle listeners once scrolling settles', () => {
    const onIdle = vi.fn()
    const stop = onHoverPreviewScrollIdle(onIdle)

    noteHoverPreviewScrollActivity(100)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(99)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2)
    expect(onIdle).toHaveBeenCalledTimes(1)
    expect(onIdle).toHaveBeenCalledWith(null)

    stop()
    noteHoverPreviewScrollActivity(50)
    vi.advanceTimersByTime(60)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('passes the last pointer position to idle listeners', () => {
    const onIdle = vi.fn()
    onHoverPreviewScrollIdle(onIdle)
    installHoverPreviewScrollGuard()

    window.dispatchEvent(new MouseEvent('mousemove', {clientX: 40, clientY: 80}))
    noteHoverPreviewScrollActivity(50)
    vi.advanceTimersByTime(51)

    expect(onIdle).toHaveBeenCalledWith({clientX: 40, clientY: 80})
  })
})
