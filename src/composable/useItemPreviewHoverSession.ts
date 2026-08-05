import {nextTick, toValue, type MaybeRefOrGetter, type Ref} from 'vue'
import type {useVideoBigPreview} from '@/composable/useVideoBigPreview'
import {
  armHoverPreviewCooldown,
  getHoverPreviewCooldownRemaining,
} from '@/utils/hoverPreviewPlayback'
import {isAppWindowFocused} from '@/utils/windowFocus'

export type HoverSessionTimeoutMap = {
  shrink?: ReturnType<typeof setTimeout>
  leave?: ReturnType<typeof setTimeout>
  hoverCooldown?: ReturnType<typeof setTimeout>
  contextMenuGuard?: ReturnType<typeof setTimeout>
}

export type MouseLeaveDismissInput = {
  isShrinking: boolean
  bigPreviewAnimation: boolean
  isBigPreviewVisual: boolean
  isBigPreviewOpen: boolean
  isBigPreviewMenuActive: boolean
}

export function shouldIgnoreMouseLeave(input: MouseLeaveDismissInput): boolean {
  return input.isShrinking || input.bigPreviewAnimation
}

export function shouldSoftDismissOnMouseLeave(input: MouseLeaveDismissInput): boolean {
  return input.isBigPreviewVisual || input.isBigPreviewOpen || input.isBigPreviewMenuActive
}

export function getMouseLeaveDismissDelayMs(softDismiss: boolean): number {
  return softDismiss ? 120 : 100
}

export type ItemPreviewHoverSessionOptions = {
  isFileExists: MaybeRefOrGetter<boolean>
  isHovered: Ref<boolean>
  isShrinking: Ref<boolean>
  playbackError: Ref<boolean>
  gridBigPreview: ReturnType<typeof useVideoBigPreview>
  bigPreviewAnimation: Ref<boolean>
  bigPreviewMenuActive: Ref<boolean>
  holdPreviewVideoDuringCollapse: Ref<boolean>
  collapsePreviewFading: Ref<boolean>
  timeouts: HoverSessionTimeoutMap
  hasFixedPreviewTime: MaybeRefOrGetter<boolean>
  getPreviewEl: () => HTMLElement | null
  clearCinemaTimeout: () => void
  clearPreviewDelayTimer: () => void
  cancelHoverPlayback: () => void
  hidePreviewVideoImmediately: () => void
  stopPreviewLiveTranscode: () => void
  finalizePreviewStop: () => void
  scheduleHoverPreviewUi: () => void
  applyFixedPreviewTime: () => void
  applyPreviewTimeFromPointer: (e: Pick<MouseEvent, 'clientX'>) => void
  closeGridBigPreview: () => Promise<void>
  resetPreviewContainer: () => void
  shouldKeepBigPreviewOpen: () => boolean
  hasActivePreviewState: () => boolean
  isBigPreviewOpen: MaybeRefOrGetter<boolean>
  onBigPreviewChange: (open: boolean) => void
  clearContextMenu?: () => void
}

export function useItemPreviewHoverSession(options: ItemPreviewHoverSessionOptions) {
  let lastHoverClientX: number | null = null

  const clearHoverTimeouts = () => {
    for (const timeout in options.timeouts) {
      clearTimeout(options.timeouts[timeout as keyof HoverSessionTimeoutMap])
    }
  }

  const removeClasses = () => {
    options.isShrinking.value = false
    options.isHovered.value = false
    options.bigPreviewAnimation.value = false
    options.holdPreviewVideoDuringCollapse.value = false
    options.collapsePreviewFading.value = false
    options.gridBigPreview.forceClose(options.getPreviewEl())
    options.onBigPreviewChange(false)
    options.stopPreviewLiveTranscode()

    options.clearCinemaTimeout()
    clearHoverTimeouts()
    options.clearPreviewDelayTimer()

    armHoverPreviewCooldown()

    void nextTick(() => {
      options.resetPreviewContainer()
      options.finalizePreviewStop()
    })
  }

  const handleMouseEnter = (e?: MouseEvent) => {
    if (!toValue(options.isFileExists) || options.isHovered.value || !isAppWindowFocused()) return

    if (e) {
      lastHoverClientX = e.clientX
    }

    clearTimeout(options.timeouts.leave)
    clearTimeout(options.timeouts.hoverCooldown)

    const cooldownRemaining = getHoverPreviewCooldownRemaining()
    if (cooldownRemaining > 0) {
      options.timeouts.hoverCooldown = setTimeout(() => {
        handleMouseEnter(
          lastHoverClientX == null
            ? undefined
            : ({clientX: lastHoverClientX} as MouseEvent),
        )
      }, cooldownRemaining)
      return
    }

    options.playbackError.value = false
    options.isHovered.value = true

    if (toValue(options.hasFixedPreviewTime)) {
      options.applyFixedPreviewTime()
    } else if (lastHoverClientX != null) {
      options.applyPreviewTimeFromPointer({clientX: lastHoverClientX})
    }

    options.scheduleHoverPreviewUi()
  }

  const stopPlayingPreview = ({force = false} = {}) => {
    if (!toValue(options.isFileExists) && !options.hasActivePreviewState()) return
    if (options.isShrinking.value && !force) return
    if (options.gridBigPreview.isCollapsing.value && !force) return
    if (!force && options.shouldKeepBigPreviewOpen()) return

    clearTimeout(options.timeouts.leave)
    options.clearCinemaTimeout()
    options.bigPreviewMenuActive.value = false

    if (force && (options.isShrinking.value || options.gridBigPreview.isCollapsing.value)) {
      clearTimeout(options.timeouts.shrink)
      options.holdPreviewVideoDuringCollapse.value = false
      options.collapsePreviewFading.value = false
      options.clearContextMenu?.()
      options.gridBigPreview.forceClose(options.getPreviewEl())
      removeClasses()
      return
    }

    const shouldShrink = !force && toValue(options.isBigPreviewOpen)

    if (shouldShrink) {
      options.clearPreviewDelayTimer()
      options.bigPreviewAnimation.value = false

      void options.closeGridBigPreview().finally(() => {
        removeClasses()
      })
      return
    }

    options.clearPreviewDelayTimer()
    clearTimeout(options.timeouts.shrink)
    options.hidePreviewVideoImmediately()
    options.stopPreviewLiveTranscode()
    options.isShrinking.value = false
    options.isHovered.value = false
    options.bigPreviewAnimation.value = false
    options.gridBigPreview.forceClose(options.getPreviewEl())
    options.onBigPreviewChange(false)

    options.clearCinemaTimeout()
    clearHoverTimeouts()

    options.resetPreviewContainer()
    options.finalizePreviewStop()
  }

  const handleMouseLeave = () => {
    clearTimeout(options.timeouts.hoverCooldown)

    const leaveInput: MouseLeaveDismissInput = {
      isShrinking: options.isShrinking.value,
      bigPreviewAnimation: options.bigPreviewAnimation.value,
      isBigPreviewVisual: options.gridBigPreview.isVisual.value,
      isBigPreviewOpen: toValue(options.isBigPreviewOpen),
      isBigPreviewMenuActive: options.bigPreviewMenuActive.value,
    }

    if (shouldIgnoreMouseLeave(leaveInput)) return

    const softDismiss = shouldSoftDismissOnMouseLeave(leaveInput)

    if (!softDismiss) {
      options.cancelHoverPlayback()
      options.clearCinemaTimeout()
    }

    clearTimeout(options.timeouts.leave)
    options.timeouts.leave = setTimeout(() => {
      stopPlayingPreview()
    }, getMouseLeaveDismissDelayMs(softDismiss))
  }

  return {
    handleMouseEnter,
    handleMouseLeave,
    stopPlayingPreview,
    removeClasses,
  }
}
