import {computed, nextTick, ref, toValue, type MaybeRefOrGetter} from 'vue'
import {
  clearVideoBigPreviewFrame,
  useVideoBigPreview,
} from '@/composable/useVideoBigPreview'
import {useSettingsStore} from '@/stores/settings'
import {isAppWindowFocused} from '@/utils/windowFocus'

export type BigVideoPreviewSize = 'original' | 'full_height' | 'two_thirds' | 'half'

export const BIG_PREVIEW_SIZE_CLASSES: Record<BigVideoPreviewSize, string> = {
  original: 'big-preview-size-original',
  full_height: 'big-preview-size-full-height',
  two_thirds: 'big-preview-size-two-thirds',
  half: 'big-preview-size-half',
}

export function normalizeBigPreviewSize(value: string | undefined): BigVideoPreviewSize {
  if (
    value === 'original' ||
    value === 'full_height' ||
    value === 'two_thirds' ||
    value === 'half'
  ) {
    return value
  }
  // Migrate legacy option names.
  if (value === 'three_quarters') return 'two_thirds'
  return 'full_height'
}

export type CanOpenBigPreviewInput = {
  isHovered: boolean
  isWindowFocused: boolean
  isFileExists: boolean
  hasPlaybackError: boolean
  hoverPreviewReady: boolean
  isVideoPreviewEnabled: boolean
  isBigPreviewEnabled: boolean
  isContextMenuOpen: boolean
}

export type ShouldKeepBigPreviewOpenInput = {
  isBigPreviewOpen: boolean
  isBigPreviewMenuActive: boolean
}

export type HasActivePreviewStateInput = {
  isHovered: boolean
  isBigPreviewActive: boolean
  isShrinking: boolean
}

export function waitForPreviewPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

export function canOpenBigPreview(input: CanOpenBigPreviewInput): boolean {
  return (
    input.isHovered &&
    input.isWindowFocused &&
    input.isFileExists &&
    !input.hasPlaybackError &&
    input.hoverPreviewReady &&
    input.isVideoPreviewEnabled &&
    input.isBigPreviewEnabled &&
    !input.isContextMenuOpen
  )
}

export function shouldKeepBigPreviewOpen(input: ShouldKeepBigPreviewOpenInput): boolean {
  // Only the big-preview context menu should keep playback alive.
  // Generic item menus must not block stopPlayingPreview.
  return input.isBigPreviewOpen && input.isBigPreviewMenuActive
}

export function hasActivePreviewState(input: HasActivePreviewStateInput): boolean {
  return input.isHovered || input.isBigPreviewActive || input.isShrinking
}

export function restorePreviewLayout(el: HTMLElement): void {
  clearVideoBigPreviewFrame(el)
  el.style.removeProperty('--big-preview-native-width')
  el.style.removeProperty('--big-preview-native-height')
  el.style.removeProperty('animation')

  el.querySelectorAll<HTMLElement>('.thumb, .preview, .timeline').forEach((node) => {
    node.style.removeProperty('width')
    node.style.removeProperty('height')
    node.style.removeProperty('min-width')
    node.style.removeProperty('min-height')
    node.style.removeProperty('left')
    node.style.removeProperty('top')
    node.style.removeProperty('opacity')
    node.style.removeProperty('filter')
    node.style.removeProperty('transform')
    node.style.removeProperty('display')
    node.style.removeProperty('pointer-events')
    node.style.removeProperty('z-index')
  })

  void el.offsetHeight
}

export function applyBigPreviewMetrics(
  preview: HTMLElement,
  width: number,
  height: number,
): void {
  if (width > 0 && height > 0) {
    preview.style.setProperty('--big-preview-native-width', `${width}px`)
    preview.style.setProperty('--big-preview-native-height', `${height}px`)
  }
}

export type ItemPreviewBigPreviewSessionOptions = {
  gridBigPreview: ReturnType<typeof useVideoBigPreview>
  getPreviewEl: () => HTMLElement | null
  getCardAnchorEl: () => HTMLElement | null
  isHovered: MaybeRefOrGetter<boolean>
  isShrinking: MaybeRefOrGetter<boolean>
  isFileExists: MaybeRefOrGetter<boolean>
  playbackError: MaybeRefOrGetter<boolean>
  hoverPreviewReady: MaybeRefOrGetter<boolean>
  isVideoPreviewEnabled: MaybeRefOrGetter<boolean>
  mediaWidth: MaybeRefOrGetter<number>
  mediaHeight: MaybeRefOrGetter<number>
  isContextMenuOpen: MaybeRefOrGetter<boolean>
  hidePreviewVideoImmediately: () => void
  pausePreviewVideoOnly: () => void
  onBigPreviewChange: (open: boolean) => void
}

export function useItemPreviewBigPreviewSession(options: ItemPreviewBigPreviewSessionOptions) {
  const settingsStore = useSettingsStore()

  const bigPreviewAnimation = ref(false)
  const bigPreviewMenuActive = ref(false)
  const holdPreviewVideoDuringCollapse = ref(false)
  const collapsePreviewFading = ref(false)

  let cinemaTimeout: ReturnType<typeof setTimeout> | undefined

  const isBigPreviewOpen = computed(() => options.gridBigPreview.isExpanded.value)

  const clearCinemaTimeout = () => {
    clearTimeout(cinemaTimeout)
    cinemaTimeout = undefined
  }

  const getCanOpenBigPreviewInput = (): CanOpenBigPreviewInput => ({
    isHovered: toValue(options.isHovered),
    isWindowFocused: isAppWindowFocused(),
    isFileExists: toValue(options.isFileExists),
    hasPlaybackError: toValue(options.playbackError),
    hoverPreviewReady: toValue(options.hoverPreviewReady),
    isVideoPreviewEnabled: toValue(options.isVideoPreviewEnabled),
    isBigPreviewEnabled: settingsStore.big_video_preview === '1',
    isContextMenuOpen: toValue(options.isContextMenuOpen),
  })

  const evaluateCanOpenBigPreview = () => canOpenBigPreview(getCanOpenBigPreviewInput())

  const evaluateShouldKeepBigPreviewOpen = () =>
    shouldKeepBigPreviewOpen({
      isBigPreviewOpen: isBigPreviewOpen.value,
      isBigPreviewMenuActive: bigPreviewMenuActive.value,
    })

  const evaluateHasActivePreviewState = () =>
    hasActivePreviewState({
      isHovered: toValue(options.isHovered),
      isBigPreviewActive: options.gridBigPreview.isActive.value,
      isShrinking: toValue(options.isShrinking),
    })

  const releasePreviewVideoAfterCollapse = () => {
    holdPreviewVideoDuringCollapse.value = false
    collapsePreviewFading.value = false
    options.hidePreviewVideoImmediately()
  }

  const resetBigPreviewOpen = () => {
    bigPreviewAnimation.value = false
    options.gridBigPreview.forceClose(options.getPreviewEl())
    options.onBigPreviewChange(false)
  }

  const applyPreviewBigPreviewMetrics = (preview: HTMLElement) => {
    applyBigPreviewMetrics(
      preview,
      toValue(options.mediaWidth),
      toValue(options.mediaHeight),
    )
  }

  const resetPreviewContainer = () => {
    bigPreviewAnimation.value = false

    const el = options.getPreviewEl()
    if (!el) return

    el.classList.remove('video-preview-container--expanded')
    Object.values(BIG_PREVIEW_SIZE_CLASSES).forEach((className) => {
      el.classList.remove(className)
    })

    restorePreviewLayout(el)
  }

  const openGridBigPreview = async () => {
    if (!evaluateCanOpenBigPreview()) return

    const preview = options.getPreviewEl()
    if (!preview) return

    const sourceRect = options.gridBigPreview.captureRect(preview)
    bigPreviewAnimation.value = true
    options.onBigPreviewChange(true)

    const opened = await options.gridBigPreview.startExpand(
      () => options.getPreviewEl(),
      sourceRect,
    )
    bigPreviewAnimation.value = false

    if (!opened || toValue(options.isContextMenuOpen)) {
      resetBigPreviewOpen()
      return
    }

    const expandedPreview = options.getPreviewEl()
    if (expandedPreview) {
      applyPreviewBigPreviewMetrics(expandedPreview)
    }
  }

  const closeGridBigPreview = async () => {
    const preview = options.getPreviewEl()
    if (!preview || !options.gridBigPreview.isExpanded.value) {
      holdPreviewVideoDuringCollapse.value = false
      collapsePreviewFading.value = false
      options.gridBigPreview.forceClose(preview)
      return
    }

    holdPreviewVideoDuringCollapse.value = true
    collapsePreviewFading.value = false
    options.pausePreviewVideoOnly()

    const anchor = options.getCardAnchorEl() ?? preview
    const targetRect = options.gridBigPreview.captureRect(anchor)
    options.onBigPreviewChange(false)

    const collapsing = options.gridBigPreview.startCollapse(
      () => options.getPreviewEl(),
      targetRect,
    )

    await nextTick()
    await waitForPreviewPaint()
    if (options.gridBigPreview.isCollapsing.value) {
      collapsePreviewFading.value = true
    }

    try {
      await collapsing
    } finally {
      releasePreviewVideoAfterCollapse()
    }
  }

  const scheduleBigPreviewAfterHoverReady = () => {
    if (settingsStore.big_video_preview !== '1') return
    if (!toValue(options.isHovered) || toValue(options.playbackError)) return

    clearCinemaTimeout()
    const delay = Math.max(0, Number(settingsStore.big_video_preview_delay) || 0)
    cinemaTimeout = setTimeout(() => {
      if (!evaluateCanOpenBigPreview()) return
      void openGridBigPreview()
    }, delay)
  }

  return {
    bigPreviewAnimation,
    bigPreviewMenuActive,
    holdPreviewVideoDuringCollapse,
    collapsePreviewFading,
    isBigPreviewOpen,
    clearCinemaTimeout,
    scheduleBigPreviewAfterHoverReady,
    openGridBigPreview,
    closeGridBigPreview,
    resetBigPreviewOpen,
    resetPreviewContainer,
    restorePreviewLayout,
    applyBigPreviewMetrics: applyPreviewBigPreviewMetrics,
    canOpenBigPreview: evaluateCanOpenBigPreview,
    shouldKeepBigPreviewOpen: evaluateShouldKeepBigPreviewOpen,
    hasActivePreviewState: evaluateHasActivePreviewState,
    releasePreviewVideoAfterCollapse,
  }
}
