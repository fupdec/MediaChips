import {beforeEach, describe, expect, it, vi} from 'vitest'
import {nextTick, ref} from 'vue'
import {
  getMouseLeaveDismissDelayMs,
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
})

describe('useItemPreviewHoverSession', () => {
  beforeEach(() => {
    vi.useFakeTimers()
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
})
