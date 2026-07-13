import {computed, nextTick, ref} from 'vue'

export type VideoBigPreviewPhase = 'idle' | 'expanding' | 'expanded' | 'collapsing'

export interface VideoBigPreviewRect {
  top: number
  left: number
  width: number
  height: number
}

export const VIDEO_BIG_PREVIEW_ANIMATION_MS = 350

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

function rectToFrame(rect: VideoBigPreviewRect) {
  return {
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  }
}

export function getFullscreenPreviewRect(): VideoBigPreviewRect {
  return {
    top: 0,
    left: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  }
}

export function captureVideoBigPreviewRect(element: HTMLElement): VideoBigPreviewRect {
  const rect = element.getBoundingClientRect()
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  }
}

export function applyVideoBigPreviewFrame(
  element: HTMLElement,
  rect: VideoBigPreviewRect,
): void {
  element.style.position = 'fixed'
  element.style.top = `${rect.top}px`
  element.style.left = `${rect.left}px`
  element.style.width = `${rect.width}px`
  element.style.height = `${rect.height}px`
  element.style.right = 'auto'
  element.style.bottom = 'auto'
  element.style.margin = '0'
  element.style.zIndex = '3000'
}

export function clearVideoBigPreviewFrame(element: HTMLElement): void {
  element.style.removeProperty('position')
  element.style.removeProperty('top')
  element.style.removeProperty('left')
  element.style.removeProperty('width')
  element.style.removeProperty('height')
  element.style.removeProperty('right')
  element.style.removeProperty('bottom')
  element.style.removeProperty('margin')
  element.style.removeProperty('z-index')
}

export function useVideoBigPreview() {
  const phase = ref<VideoBigPreviewPhase>('idle')
  let activeAnimation: Animation | null = null

  const isPortaled = computed(() => phase.value !== 'idle')
  const isExpanded = computed(() => phase.value === 'expanded' || phase.value === 'expanding')
  const isExpanding = computed(() => phase.value === 'expanding')
  const isCollapsing = computed(() => phase.value === 'collapsing')
  const isActive = computed(() => phase.value !== 'idle')
  const isVisual = computed(() => phase.value !== 'idle')

  const cancelAnimation = () => {
    activeAnimation?.cancel()
    activeAnimation = null
  }

  const animateBetween = async (
    element: HTMLElement,
    from: VideoBigPreviewRect,
    to: VideoBigPreviewRect,
  ): Promise<void> => {
    cancelAnimation()
    applyVideoBigPreviewFrame(element, from)

    activeAnimation = element.animate(
      [rectToFrame(from), rectToFrame(to)],
      {
        duration: VIDEO_BIG_PREVIEW_ANIMATION_MS,
        easing: 'ease-in-out',
        fill: 'forwards',
      },
    )

    try {
      await activeAnimation.finished
      applyVideoBigPreviewFrame(element, to)
    } catch {
      // Animation.cancel()
    } finally {
      activeAnimation = null
    }
  }

  const startExpand = async (
    resolveElement: () => HTMLElement | null,
    sourceRect: VideoBigPreviewRect,
  ): Promise<boolean> => {
    if (phase.value !== 'idle') return false

    phase.value = 'expanding'
    await nextTick()

    const element = resolveElement()
    if (!element) {
      phase.value = 'idle'
      return false
    }

    applyVideoBigPreviewFrame(element, sourceRect)
    await waitForPaint()

    try {
      await animateBetween(element, sourceRect, getFullscreenPreviewRect())
      phase.value = 'expanded'
      return true
    } catch {
      phase.value = 'idle'
      clearVideoBigPreviewFrame(element)
      return false
    }
  }

  const startCollapse = async (
    resolveElement: () => HTMLElement | null,
    targetRect: VideoBigPreviewRect,
  ): Promise<void> => {
    if (phase.value === 'idle' || phase.value === 'collapsing') return

    phase.value = 'collapsing'
    await nextTick()

    const element = resolveElement()

    if (!element) {
      phase.value = 'idle'
      return
    }

    try {
      const currentRect = captureVideoBigPreviewRect(element)
      const from = currentRect.width > 0 && currentRect.height > 0
        ? currentRect
        : getFullscreenPreviewRect()

      await animateBetween(element, from, targetRect)
    } finally {
      clearVideoBigPreviewFrame(element)
      phase.value = 'idle'
    }
  }

  const expand = async (
    element: HTMLElement,
    sourceRect: VideoBigPreviewRect,
  ): Promise<boolean> => startExpand(() => element, sourceRect)

  const collapse = async (
    element: HTMLElement,
    targetRect: VideoBigPreviewRect,
  ): Promise<void> => startCollapse(() => element, targetRect)

  const forceClose = (element?: HTMLElement | null) => {
    cancelAnimation()
    if (element) clearVideoBigPreviewFrame(element)
    phase.value = 'idle'
  }

  return {
    phase,
    isPortaled,
    isExpanded,
    isExpanding,
    isCollapsing,
    isActive,
    isVisual,
    startExpand,
    startCollapse,
    expand,
    collapse,
    forceClose,
    captureRect: captureVideoBigPreviewRect,
    getFullscreenRect: getFullscreenPreviewRect,
    clearFrame: clearVideoBigPreviewFrame,
    animationMs: VIDEO_BIG_PREVIEW_ANIMATION_MS,
  }
}
