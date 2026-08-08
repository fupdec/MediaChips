import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {nextTick, ref} from 'vue'

vi.mock('@/utils/windowFocus', () => ({
  isAppWindowFocused: () => true,
}))

import {
  HOVER_PREVIEW_AFTER_BIG_PREVIEW_MS,
  HOVER_PREVIEW_THUMB_CROSSFADE_MS,
  HOVER_PREVIEW_THUMB_CROSSFADE_SETTLE_MS,
  armHoverPreviewCooldown,
  resetHoverPreviewCooldownForTests,
} from '@/utils/hoverPreviewPlayback'
import {
  noteHoverPreviewScrollActivity,
  resetHoverPreviewScrollGuardForTests,
} from '@/utils/hoverPreviewScrollGuard'
import {
  markHoverPreviewUnavailableCached,
  resetHoverPreviewUnavailableCacheForTests,
} from '@/utils/hoverPreviewUnavailableCache'
import {
  getMouseLeaveDismissDelayMs,
  isPreviewPointerStillOver,
  resolveHoverMouseEnterAction,
  shouldIgnoreMouseLeave,
  shouldSoftDismissOnMouseLeave,
  useItemPreviewHoverSession,
} from './useItemPreviewHoverSession'

describe('shouldIgnoreMouseLeave', () => {
  const baseInput = {
    isShrinking: false,
    bigPreviewAnimation: false,
    isBigPreviewVisual: false,
    isBigPreviewOpen: false,
    isBigPreviewMenuActive: false,
  }

  it('ignores leave while shrinking or animating', () => {
    expect(shouldIgnoreMouseLeave({...baseInput, isShrinking: true})).toBe(true)
    expect(shouldIgnoreMouseLeave({...baseInput, bigPreviewAnimation: true})).toBe(true)
  })

  it('does not ignore leave in the default hover state', () => {
    expect(shouldIgnoreMouseLeave(baseInput)).toBe(false)
  })
})

describe('shouldSoftDismissOnMouseLeave', () => {
  const baseInput = {
    isShrinking: false,
    bigPreviewAnimation: false,
    isBigPreviewVisual: false,
    isBigPreviewOpen: false,
    isBigPreviewMenuActive: false,
  }

  it('soft-dismisses while big preview is active or menu is open', () => {
    expect(shouldSoftDismissOnMouseLeave({...baseInput, isBigPreviewVisual: true})).toBe(true)
    expect(shouldSoftDismissOnMouseLeave({...baseInput, isBigPreviewOpen: true})).toBe(true)
    expect(shouldSoftDismissOnMouseLeave({...baseInput, isBigPreviewMenuActive: true})).toBe(true)
  })

  it('immediate-cancel path for plain hover preview', () => {
    expect(shouldSoftDismissOnMouseLeave(baseInput)).toBe(false)
  })
})

describe('getMouseLeaveDismissDelayMs', () => {
  it('uses longer delay for soft dismiss', () => {
    expect(getMouseLeaveDismissDelayMs(true)).toBe(120)
    expect(getMouseLeaveDismissDelayMs(false)).toBe(100)
  })

  it('holds plain leave for the video fade-out', () => {
    expect(getMouseLeaveDismissDelayMs(false, true)).toBe(
      HOVER_PREVIEW_THUMB_CROSSFADE_MS + HOVER_PREVIEW_THUMB_CROSSFADE_SETTLE_MS,
    )
    expect(getMouseLeaveDismissDelayMs(true, true)).toBe(120)
  })
})

describe('resolveHoverMouseEnterAction', () => {
  it('cancels pending leave during grace while still hovered', () => {
    expect(resolveHoverMouseEnterAction({
      isFileExists: true,
      isHovered: true,
      leaveTimerPending: true,
    })).toBe('cancel-pending-leave')
  })

  it('starts hover when not hovered', () => {
    expect(resolveHoverMouseEnterAction({
      isFileExists: true,
      isHovered: false,
      leaveTimerPending: false,
    })).toBe('start-hover')
  })

  it('ignores when already hovered without a leave timer', () => {
    expect(resolveHoverMouseEnterAction({
      isFileExists: true,
      isHovered: true,
      leaveTimerPending: false,
    })).toBe('ignore')
  })

  it('ignores fresh hover starts while scrolling', () => {
    expect(resolveHoverMouseEnterAction({
      isFileExists: true,
      isHovered: false,
      leaveTimerPending: false,
      isScrolling: true,
    })).toBe('ignore')
  })

  it('still cancels pending leave while scrolling', () => {
    expect(resolveHoverMouseEnterAction({
      isFileExists: true,
      isHovered: true,
      leaveTimerPending: true,
      isScrolling: true,
    })).toBe('cancel-pending-leave')
  })
})

describe('isPreviewPointerStillOver', () => {
  it('returns false for null', () => {
    expect(isPreviewPointerStillOver(null)).toBe(false)
  })

  it('delegates to matches(:hover)', () => {
    const preview = {
      matches: vi.fn((selector: string) => selector === ':hover'),
      contains: vi.fn(),
    } as unknown as HTMLElement
    expect(isPreviewPointerStillOver(preview)).toBe(true)
    expect(preview.matches).toHaveBeenCalledWith(':hover')
  })

  it('falls back to elementFromPoint when :hover is stale', () => {
    const child = document.createElement('div')
    const preview = document.createElement('div')
    preview.appendChild(child)
    vi.spyOn(preview, 'matches').mockReturnValue(false)
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => child),
    })

    expect(isPreviewPointerStillOver(preview, {clientX: 12, clientY: 34})).toBe(true)
    expect(document.elementFromPoint).toHaveBeenCalledWith(12, 34)
  })
})

describe('useItemPreviewHoverSession', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetHoverPreviewCooldownForTests()
    resetHoverPreviewScrollGuardForTests()
    resetHoverPreviewUnavailableCacheForTests()
  })

  afterEach(() => {
    resetHoverPreviewScrollGuardForTests()
    resetHoverPreviewUnavailableCacheForTests()
  })

  it('stopPlayingPreview with force during collapse calls removeClasses path', async () => {
    const isHovered = ref(true)
    const isShrinking = ref(true)
    const bigPreviewAnimation = ref(false)
    const bigPreviewMenuActive = ref(false)
    const holdPreviewVideoDuringCollapse = ref(true)
    const collapsePreviewFading = ref(true)
    const playbackError = ref(false)
    const resetPreviewContainer = vi.fn()
    const finalizePreviewStop = vi.fn()
    const clearContextMenu = vi.fn()
    const onBigPreviewChange = vi.fn()
    const forceClose = vi.fn()
    const getPreviewEl = vi.fn(() => document.createElement('div'))

    const gridBigPreview = {
      isCollapsing: ref(true),
      forceClose,
    }

    const {stopPlayingPreview} = useItemPreviewHoverSession({
      isFileExists: true,
      isHovered,
      isShrinking,
      playbackError,
      gridBigPreview: gridBigPreview as never,
      bigPreviewAnimation,
      bigPreviewMenuActive,
      holdPreviewVideoDuringCollapse,
      collapsePreviewFading,
      timeouts: {},
      hasFixedPreviewTime: false,
      getPreviewEl,
      clearCinemaTimeout: vi.fn(),
      clearPreviewDelayTimer: vi.fn(),
      cancelHoverPlayback: vi.fn(),
      hidePreviewVideoImmediately: vi.fn(),
      stopPreviewLiveTranscode: vi.fn(),
      finalizePreviewStop,
      scheduleHoverPreviewUi: vi.fn(),
      applyFixedPreviewTime: vi.fn(),
      applyPreviewTimeFromPointer: vi.fn(),
      closeGridBigPreview: vi.fn(async () => {}),
      resetPreviewContainer,
      shouldKeepBigPreviewOpen: () => false,
      hasActivePreviewState: () => true,
      isBigPreviewOpen: false,
      onBigPreviewChange,
      clearContextMenu,
    })

    stopPlayingPreview({force: true})

    expect(clearContextMenu).toHaveBeenCalled()
    expect(forceClose).toHaveBeenCalled()
    expect(isHovered.value).toBe(false)
    expect(isShrinking.value).toBe(false)
    expect(holdPreviewVideoDuringCollapse.value).toBe(false)
    expect(collapsePreviewFading.value).toBe(false)
    expect(onBigPreviewChange).toHaveBeenCalledWith(false)

    await nextTick()
    expect(resetPreviewContainer).toHaveBeenCalled()
    expect(finalizePreviewStop).toHaveBeenCalled()
  })

  it('re-enter during leave grace cancels pending stop without remount', () => {
    const isHovered = ref(true)
    const hoverPreviewReady = ref(true)
    const timeouts: {leave?: ReturnType<typeof setTimeout>} = {}
    const cancelHoverPlayback = vi.fn(() => {
      hoverPreviewReady.value = false
    })
    const hidePreviewVideoImmediately = vi.fn()
    const finalizePreviewStop = vi.fn()
    const scheduleHoverPreviewUi = vi.fn()
    const stopPreviewLiveTranscode = vi.fn()

    const session = useItemPreviewHoverSession({
      isFileExists: true,
      isHovered,
      isShrinking: ref(false),
      playbackError: ref(false),
      gridBigPreview: {
        isCollapsing: ref(false),
        isVisual: ref(false),
        forceClose: vi.fn(),
      } as never,
      bigPreviewAnimation: ref(false),
      bigPreviewMenuActive: ref(false),
      holdPreviewVideoDuringCollapse: ref(false),
      collapsePreviewFading: ref(false),
      timeouts,
      hasFixedPreviewTime: false,
      getPreviewEl: () => null,
      clearCinemaTimeout: vi.fn(),
      clearPreviewDelayTimer: vi.fn(),
      cancelHoverPlayback,
      hidePreviewVideoImmediately,
      stopPreviewLiveTranscode,
      finalizePreviewStop,
      scheduleHoverPreviewUi,
      applyFixedPreviewTime: vi.fn(),
      applyPreviewTimeFromPointer: vi.fn(),
      closeGridBigPreview: vi.fn(async () => {}),
      resetPreviewContainer: vi.fn(),
      shouldKeepBigPreviewOpen: () => false,
      hasActivePreviewState: () => true,
      isHoverVideoArmed: true,
      hoverPreviewReady,
      isBigPreviewOpen: false,
      onBigPreviewChange: vi.fn(),
    })

    session.handleMouseLeave()
    expect(cancelHoverPlayback).toHaveBeenCalled()
    expect(timeouts.leave).toBeTruthy()
    expect(hoverPreviewReady.value).toBe(false)

    session.handleMouseEnter()
    expect(timeouts.leave).toBeUndefined()
    expect(scheduleHoverPreviewUi).not.toHaveBeenCalled()
    expect(hoverPreviewReady.value).toBe(true)

    vi.advanceTimersByTime(
      HOVER_PREVIEW_THUMB_CROSSFADE_MS + HOVER_PREVIEW_THUMB_CROSSFADE_SETTLE_MS + 50,
    )
    expect(hidePreviewVideoImmediately).not.toHaveBeenCalled()
    expect(finalizePreviewStop).not.toHaveBeenCalled()
    expect(isHovered.value).toBe(true)
  })

  it('leave without re-enter still finalizes after grace', () => {
    const isHovered = ref(true)
    const timeouts: {leave?: ReturnType<typeof setTimeout>} = {}
    const hidePreviewVideoImmediately = vi.fn()
    const finalizePreviewStop = vi.fn()

    const session = useItemPreviewHoverSession({
      isFileExists: true,
      isHovered,
      isShrinking: ref(false),
      playbackError: ref(false),
      gridBigPreview: {
        isCollapsing: ref(false),
        isVisual: ref(false),
        forceClose: vi.fn(),
      } as never,
      bigPreviewAnimation: ref(false),
      bigPreviewMenuActive: ref(false),
      holdPreviewVideoDuringCollapse: ref(false),
      collapsePreviewFading: ref(false),
      timeouts,
      hasFixedPreviewTime: false,
      getPreviewEl: () => null,
      clearCinemaTimeout: vi.fn(),
      clearPreviewDelayTimer: vi.fn(),
      cancelHoverPlayback: vi.fn(),
      hidePreviewVideoImmediately,
      stopPreviewLiveTranscode: vi.fn(),
      finalizePreviewStop,
      scheduleHoverPreviewUi: vi.fn(),
      applyFixedPreviewTime: vi.fn(),
      applyPreviewTimeFromPointer: vi.fn(),
      closeGridBigPreview: vi.fn(async () => {}),
      resetPreviewContainer: vi.fn(),
      shouldKeepBigPreviewOpen: () => false,
      hasActivePreviewState: () => true,
      isHoverVideoArmed: true,
      isBigPreviewOpen: false,
      onBigPreviewChange: vi.fn(),
    })

    session.handleMouseLeave()
    vi.advanceTimersByTime(100)
    expect(hidePreviewVideoImmediately).toHaveBeenCalled()
    expect(finalizePreviewStop).toHaveBeenCalled()
    expect(isHovered.value).toBe(false)
  })

  it('keeps video mounted through video fade-out when preview was ready', () => {
    const isHovered = ref(true)
    const hoverPreviewReady = ref(true)
    const timeouts: {leave?: ReturnType<typeof setTimeout>} = {}
    const hidePreviewVideoImmediately = vi.fn()
    const finalizePreviewStop = vi.fn()
    const cancelHoverPlayback = vi.fn(() => {
      hoverPreviewReady.value = false
    })

    const session = useItemPreviewHoverSession({
      isFileExists: true,
      isHovered,
      isShrinking: ref(false),
      playbackError: ref(false),
      gridBigPreview: {
        isCollapsing: ref(false),
        isVisual: ref(false),
        forceClose: vi.fn(),
      } as never,
      bigPreviewAnimation: ref(false),
      bigPreviewMenuActive: ref(false),
      holdPreviewVideoDuringCollapse: ref(false),
      collapsePreviewFading: ref(false),
      timeouts,
      hasFixedPreviewTime: false,
      getPreviewEl: () => null,
      clearCinemaTimeout: vi.fn(),
      clearPreviewDelayTimer: vi.fn(),
      cancelHoverPlayback,
      hidePreviewVideoImmediately,
      stopPreviewLiveTranscode: vi.fn(),
      finalizePreviewStop,
      scheduleHoverPreviewUi: vi.fn(),
      applyFixedPreviewTime: vi.fn(),
      applyPreviewTimeFromPointer: vi.fn(),
      closeGridBigPreview: vi.fn(async () => {}),
      resetPreviewContainer: vi.fn(),
      shouldKeepBigPreviewOpen: () => false,
      hasActivePreviewState: () => true,
      isHoverVideoArmed: true,
      hoverPreviewReady,
      isBigPreviewOpen: false,
      onBigPreviewChange: vi.fn(),
    })

    session.handleMouseLeave()
    expect(hoverPreviewReady.value).toBe(false)

    vi.advanceTimersByTime(100)
    expect(hidePreviewVideoImmediately).not.toHaveBeenCalled()

    vi.advanceTimersByTime(
      HOVER_PREVIEW_THUMB_CROSSFADE_MS + HOVER_PREVIEW_THUMB_CROSSFADE_SETTLE_MS,
    )
    expect(hidePreviewVideoImmediately).toHaveBeenCalled()
    expect(finalizePreviewStop).toHaveBeenCalled()
    expect(isHovered.value).toBe(false)
  })

  it('rearms hover after removeClasses when pointer still over preview', async () => {
    const isHovered = ref(true)
    const scheduleHoverPreviewUi = vi.fn()
    const preview = {
      matches: vi.fn(() => true),
      querySelector: vi.fn(() => null),
    } as unknown as HTMLElement

    const session = useItemPreviewHoverSession({
      isFileExists: true,
      isHovered,
      isShrinking: ref(false),
      playbackError: ref(false),
      gridBigPreview: {
        isCollapsing: ref(false),
        isActive: ref(false),
        isVisual: ref(false),
        forceClose: vi.fn(),
      } as never,
      bigPreviewAnimation: ref(false),
      bigPreviewMenuActive: ref(false),
      holdPreviewVideoDuringCollapse: ref(false),
      collapsePreviewFading: ref(false),
      timeouts: {},
      hasFixedPreviewTime: false,
      getPreviewEl: () => preview,
      clearCinemaTimeout: vi.fn(),
      clearPreviewDelayTimer: vi.fn(),
      cancelHoverPlayback: vi.fn(),
      hidePreviewVideoImmediately: vi.fn(),
      stopPreviewLiveTranscode: vi.fn(),
      finalizePreviewStop: vi.fn(),
      scheduleHoverPreviewUi,
      applyFixedPreviewTime: vi.fn(),
      applyPreviewTimeFromPointer: vi.fn(),
      closeGridBigPreview: vi.fn(async () => {}),
      resetPreviewContainer: vi.fn(),
      shouldKeepBigPreviewOpen: () => false,
      hasActivePreviewState: () => true,
      isBigPreviewOpen: false,
      onBigPreviewChange: vi.fn(),
    })

    session.removeClasses()
    expect(isHovered.value).toBe(false)

    await nextTick()
    expect(isHovered.value).toBe(false)

    vi.advanceTimersByTime(HOVER_PREVIEW_AFTER_BIG_PREVIEW_MS)
    expect(isHovered.value).toBe(true)
    expect(scheduleHoverPreviewUi).toHaveBeenCalled()
  })

  it('handleMouseMove starts hover when mouseenter was skipped', () => {
    const isHovered = ref(false)
    const scheduleHoverPreviewUi = vi.fn()

    const session = useItemPreviewHoverSession({
      isFileExists: true,
      isHovered,
      isShrinking: ref(false),
      playbackError: ref(false),
      gridBigPreview: {
        isCollapsing: ref(false),
        isActive: ref(false),
        isVisual: ref(false),
        forceClose: vi.fn(),
      } as never,
      bigPreviewAnimation: ref(false),
      bigPreviewMenuActive: ref(false),
      holdPreviewVideoDuringCollapse: ref(false),
      collapsePreviewFading: ref(false),
      timeouts: {},
      hasFixedPreviewTime: false,
      getPreviewEl: () => null,
      clearCinemaTimeout: vi.fn(),
      clearPreviewDelayTimer: vi.fn(),
      cancelHoverPlayback: vi.fn(),
      hidePreviewVideoImmediately: vi.fn(),
      stopPreviewLiveTranscode: vi.fn(),
      finalizePreviewStop: vi.fn(),
      scheduleHoverPreviewUi,
      applyFixedPreviewTime: vi.fn(),
      applyPreviewTimeFromPointer: vi.fn(),
      closeGridBigPreview: vi.fn(async () => {}),
      resetPreviewContainer: vi.fn(),
      shouldKeepBigPreviewOpen: () => false,
      hasActivePreviewState: () => false,
      isBigPreviewOpen: false,
      onBigPreviewChange: vi.fn(),
    })

    session.handleMouseMove({clientX: 42} as MouseEvent)
    expect(isHovered.value).toBe(true)
    expect(scheduleHoverPreviewUi).toHaveBeenCalled()
  })

  it('does not start hover while scrolling even if the pointer enters a thumb', () => {
    const isHovered = ref(false)
    const scheduleHoverPreviewUi = vi.fn()
    noteHoverPreviewScrollActivity(500)

    const session = useItemPreviewHoverSession({
      isFileExists: true,
      isHovered,
      isShrinking: ref(false),
      playbackError: ref(false),
      gridBigPreview: {
        isCollapsing: ref(false),
        isActive: ref(false),
        isVisual: ref(false),
        forceClose: vi.fn(),
      } as never,
      bigPreviewAnimation: ref(false),
      bigPreviewMenuActive: ref(false),
      holdPreviewVideoDuringCollapse: ref(false),
      collapsePreviewFading: ref(false),
      timeouts: {},
      hasFixedPreviewTime: false,
      getPreviewEl: () => null,
      clearCinemaTimeout: vi.fn(),
      clearPreviewDelayTimer: vi.fn(),
      cancelHoverPlayback: vi.fn(),
      hidePreviewVideoImmediately: vi.fn(),
      stopPreviewLiveTranscode: vi.fn(),
      finalizePreviewStop: vi.fn(),
      scheduleHoverPreviewUi,
      applyFixedPreviewTime: vi.fn(),
      applyPreviewTimeFromPointer: vi.fn(),
      closeGridBigPreview: vi.fn(async () => {}),
      resetPreviewContainer: vi.fn(),
      shouldKeepBigPreviewOpen: () => false,
      hasActivePreviewState: () => false,
      isBigPreviewOpen: false,
      onBigPreviewChange: vi.fn(),
    })

    session.handleMouseEnter({clientX: 10} as MouseEvent)
    session.handleMouseMove({clientX: 12} as MouseEvent)
    expect(isHovered.value).toBe(false)
    expect(scheduleHoverPreviewUi).not.toHaveBeenCalled()
  })

  it('rearms hover after scroll settles when the pointer stayed on the thumb', () => {
    const isHovered = ref(false)
    const scheduleHoverPreviewUi = vi.fn()
    const preview = {
      matches: vi.fn((selector: string) => selector === ':hover'),
    } as unknown as HTMLElement

    useItemPreviewHoverSession({
      isFileExists: true,
      isHovered,
      isShrinking: ref(false),
      playbackError: ref(false),
      gridBigPreview: {
        isCollapsing: ref(false),
        isActive: ref(false),
        isVisual: ref(false),
        forceClose: vi.fn(),
      } as never,
      bigPreviewAnimation: ref(false),
      bigPreviewMenuActive: ref(false),
      holdPreviewVideoDuringCollapse: ref(false),
      collapsePreviewFading: ref(false),
      timeouts: {},
      hasFixedPreviewTime: false,
      getPreviewEl: () => preview,
      clearCinemaTimeout: vi.fn(),
      clearPreviewDelayTimer: vi.fn(),
      cancelHoverPlayback: vi.fn(),
      hidePreviewVideoImmediately: vi.fn(),
      stopPreviewLiveTranscode: vi.fn(),
      finalizePreviewStop: vi.fn(),
      scheduleHoverPreviewUi,
      applyFixedPreviewTime: vi.fn(),
      applyPreviewTimeFromPointer: vi.fn(),
      closeGridBigPreview: vi.fn(async () => {}),
      resetPreviewContainer: vi.fn(),
      shouldKeepBigPreviewOpen: () => false,
      hasActivePreviewState: () => false,
      isBigPreviewOpen: false,
      onBigPreviewChange: vi.fn(),
    })

    noteHoverPreviewScrollActivity(200)
    expect(isHovered.value).toBe(false)

    vi.advanceTimersByTime(201)
    expect(isHovered.value).toBe(true)
    expect(scheduleHoverPreviewUi).toHaveBeenCalled()
  })

  it('rearms after scroll even when big-preview cooldown is still armed', () => {
    const isHovered = ref(false)
    const scheduleHoverPreviewUi = vi.fn()
    const child = document.createElement('div')
    const preview = document.createElement('div')
    preview.appendChild(child)
    vi.spyOn(preview, 'matches').mockReturnValue(false)
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => child),
    })
    armHoverPreviewCooldown(5000)

    useItemPreviewHoverSession({
      isFileExists: true,
      isHovered,
      isShrinking: ref(false),
      playbackError: ref(false),
      gridBigPreview: {
        isCollapsing: ref(false),
        isActive: ref(false),
        isVisual: ref(false),
        forceClose: vi.fn(),
      } as never,
      bigPreviewAnimation: ref(false),
      bigPreviewMenuActive: ref(false),
      holdPreviewVideoDuringCollapse: ref(false),
      collapsePreviewFading: ref(false),
      timeouts: {},
      hasFixedPreviewTime: false,
      getPreviewEl: () => preview,
      clearCinemaTimeout: vi.fn(),
      clearPreviewDelayTimer: vi.fn(),
      cancelHoverPlayback: vi.fn(),
      hidePreviewVideoImmediately: vi.fn(),
      stopPreviewLiveTranscode: vi.fn(),
      finalizePreviewStop: vi.fn(),
      scheduleHoverPreviewUi,
      applyFixedPreviewTime: vi.fn(),
      applyPreviewTimeFromPointer: vi.fn(),
      closeGridBigPreview: vi.fn(async () => {}),
      resetPreviewContainer: vi.fn(),
      shouldKeepBigPreviewOpen: () => false,
      hasActivePreviewState: () => false,
      isBigPreviewOpen: false,
      onBigPreviewChange: vi.fn(),
    })

    window.dispatchEvent(new MouseEvent('mousemove', {clientX: 5, clientY: 6}))
    noteHoverPreviewScrollActivity(100)
    vi.advanceTimersByTime(101)

    expect(isHovered.value).toBe(true)
    expect(scheduleHoverPreviewUi).toHaveBeenCalled()
  })

  it('shows cached unavailable notice without rescheduling playback', () => {
    const isHovered = ref(false)
    const playbackError = ref(false)
    const scheduleHoverPreviewUi = vi.fn()
    markHoverPreviewUnavailableCached(99)

    const session = useItemPreviewHoverSession({
      mediaId: 99,
      isFileExists: true,
      isHovered,
      isShrinking: ref(false),
      playbackError,
      gridBigPreview: {
        isCollapsing: ref(false),
        isActive: ref(false),
        isVisual: ref(false),
        forceClose: vi.fn(),
      } as never,
      bigPreviewAnimation: ref(false),
      bigPreviewMenuActive: ref(false),
      holdPreviewVideoDuringCollapse: ref(false),
      collapsePreviewFading: ref(false),
      timeouts: {},
      hasFixedPreviewTime: false,
      getPreviewEl: () => null,
      clearCinemaTimeout: vi.fn(),
      clearPreviewDelayTimer: vi.fn(),
      cancelHoverPlayback: vi.fn(),
      hidePreviewVideoImmediately: vi.fn(),
      stopPreviewLiveTranscode: vi.fn(),
      finalizePreviewStop: vi.fn(),
      scheduleHoverPreviewUi,
      applyFixedPreviewTime: vi.fn(),
      applyPreviewTimeFromPointer: vi.fn(),
      closeGridBigPreview: vi.fn(async () => {}),
      resetPreviewContainer: vi.fn(),
      shouldKeepBigPreviewOpen: () => false,
      hasActivePreviewState: () => false,
      isBigPreviewOpen: false,
      onBigPreviewChange: vi.fn(),
    })

    session.handleMouseEnter({clientX: 10} as MouseEvent)
    expect(isHovered.value).toBe(true)
    expect(playbackError.value).toBe(true)
    expect(scheduleHoverPreviewUi).not.toHaveBeenCalled()
  })
})
