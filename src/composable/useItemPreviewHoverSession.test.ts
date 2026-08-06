import {beforeEach, describe, expect, it, vi} from 'vitest'
import {nextTick, ref} from 'vue'

vi.mock('@/utils/windowFocus', () => ({
  isAppWindowFocused: () => true,
}))

import {
  HOVER_PREVIEW_THUMB_CROSSFADE_MS,
  HOVER_PREVIEW_THUMB_CROSSFADE_SETTLE_MS,
  resetHoverPreviewCooldownForTests,
} from '@/utils/hoverPreviewPlayback'
import {
  getMouseLeaveDismissDelayMs,
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

  it('holds plain leave for the thumb reverse crossfade', () => {
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
      isFocused: true,
      isHovered: true,
      leaveTimerPending: true,
    })).toBe('cancel-pending-leave')
  })

  it('starts hover when not hovered', () => {
    expect(resolveHoverMouseEnterAction({
      isFileExists: true,
      isFocused: true,
      isHovered: false,
      leaveTimerPending: false,
    })).toBe('start-hover')
  })

  it('ignores when already hovered without a leave timer', () => {
    expect(resolveHoverMouseEnterAction({
      isFileExists: true,
      isFocused: true,
      isHovered: true,
      leaveTimerPending: false,
    })).toBe('ignore')
  })
})

describe('useItemPreviewHoverSession', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetHoverPreviewCooldownForTests()
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
    const preserveHoverPlaybackAfterLeave = vi.fn()
    const hidePreviewVideoImmediately = vi.fn()
    const finalizePreviewStop = vi.fn()
    const scheduleHoverPreviewUi = vi.fn()
    const stopPreviewLiveTranscode = vi.fn()
    const video = {
      currentSrc: 'http://local/video',
      readyState: HTMLMediaElement.HAVE_CURRENT_DATA,
      paused: true,
      pause: vi.fn(),
      play: vi.fn(async () => {}),
      getAttribute: (name: string) => (name === 'src' ? 'http://local/video' : null),
    }

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
      getPreviewEl: () => ({querySelector: () => video} as unknown as HTMLElement),
      clearCinemaTimeout: vi.fn(),
      clearPreviewDelayTimer: vi.fn(),
      cancelHoverPlayback,
      preserveHoverPlaybackAfterLeave,
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
    expect(preserveHoverPlaybackAfterLeave).toHaveBeenCalled()
    expect(scheduleHoverPreviewUi).not.toHaveBeenCalled()
    expect(hoverPreviewReady.value).toBe(true)
    expect(video.play).toHaveBeenCalled()

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

  it('keeps video mounted through thumb reverse crossfade when preview was ready', () => {
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
})
