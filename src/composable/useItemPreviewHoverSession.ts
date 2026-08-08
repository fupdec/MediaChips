import {nextTick, toValue, type MaybeRefOrGetter, type Ref} from 'vue'
import type {useVideoBigPreview} from '@/composable/useVideoBigPreview'
import {
  armHoverPreviewCooldown,
  getHoverPreviewCooldownRemaining,
  HOVER_PREVIEW_THUMB_CROSSFADE_MS,
  HOVER_PREVIEW_THUMB_CROSSFADE_SETTLE_MS,
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

export function getMouseLeaveDismissDelayMs(
  softDismiss: boolean,
  holdForThumbCrossfade = false,
): number {
  if (softDismiss) return 120
  // Keep <video> mounted until the thumb finishes fading back in (+ compositor settle).
  if (holdForThumbCrossfade) {
    return HOVER_PREVIEW_THUMB_CROSSFADE_MS + HOVER_PREVIEW_THUMB_CROSSFADE_SETTLE_MS
  }
  return 100
}

export type HoverMouseEnterAction = 'cancel-pending-leave' | 'start-hover' | 'ignore'

/** Decide mouseenter during leave-grace vs a fresh hover start. */
export function resolveHoverMouseEnterAction(input: {
  isFileExists: boolean
  isFocused: boolean
  isHovered: boolean
  leaveTimerPending: boolean
}): HoverMouseEnterAction {
  if (!input.isFileExists || !input.isFocused) return 'ignore'
  if (input.leaveTimerPending && input.isHovered) return 'cancel-pending-leave'
  if (input.isHovered) return 'ignore'
  return 'start-hover'
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
  /** True when hover <video> is mounted or ready — skip reschedule on leave-grace cancel. */
  isHoverVideoArmed?: MaybeRefOrGetter<boolean>
  /** When set, leave-grace re-entry can restore the thumb→video crossfade. */
  hoverPreviewReady?: Ref<boolean>
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
    if (e) {
      lastHoverClientX = e.clientX
    }

    const action = resolveHoverMouseEnterAction({
      isFileExists: Boolean(toValue(options.isFileExists)),
      isFocused: isAppWindowFocused(),
      isHovered: options.isHovered.value,
      leaveTimerPending: options.timeouts.leave != null,
    })
    if (action === 'ignore') return

    clearTimeout(options.timeouts.leave)
    options.timeouts.leave = undefined
    clearTimeout(options.timeouts.hoverCooldown)

    if (action === 'cancel-pending-leave') {
      // Delay was cleared on leave; reschedule only if video never armed.
      if (!toValue(options.isHoverVideoArmed)) {
        options.scheduleHoverPreviewUi()
      } else if (options.hoverPreviewReady) {
        // Reverse the leave crossfade: thumb was covering again, reveal video.
        options.hoverPreviewReady.value = true
        const video = options.getPreviewEl()?.querySelector('video')
        if (video && video.paused && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          void video.play().catch(() => {})
        }
      }
      return
    }

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
    // Capture before cancel-hover clears ready (that flip starts the thumb fade-in).
    const holdForThumbCrossfade = !softDismiss && Boolean(options.hoverPreviewReady?.value)

    if (!softDismiss) {
      options.cancelHoverPlayback()
      options.clearCinemaTimeout()
      const video = options.getPreviewEl()?.querySelector('video')
      video?.pause()
    }

    clearTimeout(options.timeouts.leave)
    options.timeouts.leave = setTimeout(() => {
      stopPlayingPreview()
    }, getMouseLeaveDismissDelayMs(softDismiss, holdForThumbCrossfade))
  }

  return {
    handleMouseEnter,
    handleMouseLeave,
    stopPlayingPreview,
    removeClasses,
  }
}
