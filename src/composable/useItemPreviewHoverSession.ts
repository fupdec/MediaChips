import {nextTick, getCurrentScope, onScopeDispose, toValue, type MaybeRefOrGetter, type Ref} from 'vue'
import type {useVideoBigPreview} from '@/composable/useVideoBigPreview'
import {
  armHoverPreviewCooldown,
  clearHoverPreviewCooldown,
  getHoverPreviewCooldownRemaining,
  HOVER_PREVIEW_THUMB_CROSSFADE_MS,
  HOVER_PREVIEW_THUMB_CROSSFADE_SETTLE_MS,
} from '@/utils/hoverPreviewPlayback'
import {
  installHoverPreviewScrollGuard,
  isHoverPreviewBlockedByScroll,
  onHoverPreviewScrollIdle,
  type HoverPreviewPointer,
} from '@/utils/hoverPreviewScrollGuard'
import {isHoverPreviewUnavailableCached} from '@/utils/hoverPreviewUnavailableCache'

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
  isHovered: boolean
  leaveTimerPending: boolean
  /** True while the grid/page is scrolling (or shortly after). */
  isScrolling?: boolean
}): HoverMouseEnterAction {
  // Mouseenter itself is the signal — do not require window.focused (occlusion /
  // DevTools / IPC false-negatives previously returned 'ignore' with zero UI).
  if (!input.isFileExists) return 'ignore'
  if (input.leaveTimerPending && input.isHovered) return 'cancel-pending-leave'
  if (input.isHovered) return 'ignore'
  // Cursor often lands on a thumb while content moves under it during scroll.
  if (input.isScrolling) return 'ignore'
  return 'start-hover'
}

export type ItemPreviewHoverSessionOptions = {
  mediaId?: MaybeRefOrGetter<number>
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
  /** Ensure the static poster is available when the pointer reaches a card. */
  requestThumb?: () => void
  /** True when hover <video> is mounted or ready — skip reschedule on leave-grace cancel. */
  isHoverVideoArmed?: MaybeRefOrGetter<boolean>
  /** When set, leave-grace re-entry can restore the thumb→video crossfade. */
  hoverPreviewReady?: Ref<boolean>
  isBigPreviewOpen: MaybeRefOrGetter<boolean>
  onBigPreviewChange: (open: boolean) => void
  clearContextMenu?: () => void
}

/** True when the pointer is still over the preview after big-preview teardown. */
export function isPreviewPointerStillOver(
  preview: HTMLElement | null | undefined,
  pointer?: HoverPreviewPointer | null,
): boolean {
  if (!preview) return false
  try {
    if (preview.matches(':hover')) return true
  } catch {
    // matches() can throw on detached nodes
  }

  // After wheel/scroll, :hover is often stale until the next mousemove.
  if (
    pointer
    && Number.isFinite(pointer.clientX)
    && Number.isFinite(pointer.clientY)
    && typeof document !== 'undefined'
  ) {
    try {
      const top = document.elementFromPoint(pointer.clientX, pointer.clientY)
      return Boolean(top && (top === preview || preview.contains(top)))
    } catch {
      return false
    }
  }
  return false
}

export function useItemPreviewHoverSession(options: ItemPreviewHoverSessionOptions) {
  installHoverPreviewScrollGuard()
  let lastHoverClientX: number | null = null

  const clearHoverTimeouts = () => {
    for (const timeout in options.timeouts) {
      clearTimeout(options.timeouts[timeout as keyof HoverSessionTimeoutMap])
    }
  }

  const canRearmHoverFromPointer = () => (
    Boolean(toValue(options.isFileExists))
    && !options.isHovered.value
    && !options.isShrinking.value
    && !options.bigPreviewAnimation.value
    && !options.gridBigPreview.isActive.value
    && !isHoverPreviewBlockedByScroll()
  )

  const handleMouseEnter = (e?: MouseEvent) => {
    if (e) {
      lastHoverClientX = e.clientX
    }

    const action = resolveHoverMouseEnterAction({
      isFileExists: Boolean(toValue(options.isFileExists)),
      isHovered: options.isHovered.value,
      leaveTimerPending: options.timeouts.leave != null,
      isScrolling: isHoverPreviewBlockedByScroll(),
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
        // Reverse the leave fade: reveal the hover video again over the thumb.
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

    options.isHovered.value = true

    // Failed previews stay unavailable for this grid load — show notice, skip fetch.
    if (options.mediaId != null && isHoverPreviewUnavailableCached(toValue(options.mediaId))) {
      options.playbackError.value = true
      return
    }

    options.playbackError.value = false
    options.requestThumb?.()

    if (toValue(options.hasFixedPreviewTime)) {
      options.applyFixedPreviewTime()
    } else if (lastHoverClientX != null) {
      options.applyPreviewTimeFromPointer({clientX: lastHoverClientX})
    }

    options.scheduleHoverPreviewUi()
  }

  /**
   * Click-dismiss / collapse clears isHovered without a mouseleave→enter cycle.
   * Re-arm when the pointer never left the card (no fresh mouseenter).
   */
  const rearmHoverIfPointerStillOver = (
    pointer?: HoverPreviewPointer | null,
    {bypassCooldown = false}: {bypassCooldown?: boolean} = {},
  ) => {
    if (!canRearmHoverFromPointer()) return
    if (!isPreviewPointerStillOver(options.getPreviewEl(), pointer)) return
    if (bypassCooldown) clearHoverPreviewCooldown()
    const clientX = pointer?.clientX ?? lastHoverClientX
    handleMouseEnter(
      clientX == null ? undefined : ({clientX} as MouseEvent),
    )
  }

  // After scroll settles, start hover if the cursor stayed on this thumb
  // (scroll-time mouseenter was ignored and no leave/re-enter follows).
  const stopScrollIdleRearm = onHoverPreviewScrollIdle((pointer) => {
    // Big-preview cooldown must not block the card under the cursor after scroll —
    // mouseleave during scroll already cancelled the deferred cooldown timer.
    rearmHoverIfPointerStillOver(pointer, {bypassCooldown: true})
  })
  if (getCurrentScope()) {
    onScopeDispose(stopScrollIdleRearm)
  }

  const scheduleRearmHoverIfPointerStillOver = () => {
    // Wait out the post–big-preview cooldown, then re-arm if the pointer
    // never left the card (click-dismiss does not emit mouseenter).
    clearTimeout(options.timeouts.hoverCooldown)
    const delay = getHoverPreviewCooldownRemaining()
    options.timeouts.hoverCooldown = setTimeout(() => {
      options.timeouts.hoverCooldown = undefined
      rearmHoverIfPointerStillOver()
    }, delay)
  }

  /** Safety net when mouseenter was skipped (post–big-preview / Teleport). */
  const handleMouseMove = (e: MouseEvent) => {
    lastHoverClientX = e.clientX
    if (!canRearmHoverFromPointer()) return
    handleMouseEnter(e)
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
      scheduleRearmHoverIfPointerStillOver()
    })
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
    // Capture before cancel-hover clears ready (that flip starts the video fade-out).
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
    handleMouseMove,
    handleMouseLeave,
    stopPlayingPreview,
    removeClasses,
  }
}
