import { defineStore } from 'pinia'

export interface SpotlightHole {
  left: number
  top: number
  width: number
  height: number
  radius: number
}

export interface SpotlightOptions {
  durationMs?: number
  pad?: number
  opacity?: number
  /** Wait after dialogs close / before measuring (ms). */
  settleMs?: number
  /** When true, only the first matching element is highlighted. */
  firstOnly?: boolean
  onDone?: () => void
}

const DEFAULT_DURATION_MS = 3000
const DEFAULT_PAD = 6
const DEFAULT_OPACITY = 0.18
const DEFAULT_SETTLE_MS = 280

let hideTimer: ReturnType<typeof setTimeout> | null = null
let doneCallback: (() => void) | null = null
let activeSelectors: string | string[] | null = null
let activePad = DEFAULT_PAD
let activeFirstOnly = false

function parseRadiusPx(value: string, fallback = 12): number {
  const first = value.split(' ')[0]?.trim() || ''
  const num = Number.parseFloat(first)
  return Number.isFinite(num) ? num : fallback
}

function collectElements(selectors: string | string[]): HTMLElement[] {
  const selectorArray = Array.isArray(selectors) ? selectors : [selectors]
  const seen = new Set<HTMLElement>()
  const elements: HTMLElement[] = []

  for (const selector of selectorArray) {
    if (!selector) continue
    document.querySelectorAll(selector).forEach((node) => {
      if (!(node instanceof HTMLElement) || seen.has(node)) return
      seen.add(node)
      elements.push(node)
    })
  }

  return elements
}

function isElementInViewport(el: HTMLElement): boolean {
  const box = el.getBoundingClientRect()
  if (box.width <= 0 || box.height <= 0) return false
  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 0
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 0
  return box.bottom > 0 && box.right > 0 && box.top < viewportH && box.left < viewportW
}

function pickSpotlightElements(
  selectors: string | string[],
  firstOnly: boolean,
): HTMLElement[] {
  const elements = collectElements(selectors)
  if (!firstOnly) return elements
  if (!elements.length) return []
  const visible = elements.find((el) => isElementInViewport(el))
  return [visible || elements[0]]
}

function measureHole(el: HTMLElement, pad: number): SpotlightHole {
  const box = el.getBoundingClientRect()
  const styles = window.getComputedStyle(el)
  const radius = parseRadiusPx(styles.borderRadius, 12)

  return {
    left: Math.max(0, box.left - pad),
    top: Math.max(0, box.top - pad),
    width: Math.max(0, box.width + pad * 2),
    height: Math.max(0, box.height + pad * 2),
    radius: Math.max(0, radius + pad / 2),
  }
}

function clearHideTimer() {
  if (hideTimer == null) return
  clearTimeout(hideTimer)
  hideTimer = null
}

function runDoneCallback() {
  const cb = doneCallback
  doneCallback = null
  cb?.()
}

export const useElementSpotlightStore = defineStore('elementSpotlight', {
  state: () => ({
    show: false,
    holes: [] as SpotlightHole[],
    opacity: DEFAULT_OPACITY,
    viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 0,
    viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 0,
  }),
  actions: {
    clear() {
      this.show = false
      this.holes = []
      activeSelectors = null
    },

    updateViewport() {
      if (typeof window === 'undefined') return
      this.viewportWidth = window.innerWidth
      this.viewportHeight = window.innerHeight
    },

    refreshHoles() {
      if (!this.show || activeSelectors == null) return
      this.updateViewport()
      const elements = pickSpotlightElements(activeSelectors, activeFirstOnly)
      const nextHoles = elements
        .map((el) => measureHole(el, activePad))
        .filter((hole) => hole.width > 0 && hole.height > 0)
      // Keep previous holes when the target is briefly missing (virtual lists).
      if (nextHoles.length) {
        this.holes = nextHoles
      }
    },

    /**
     * Spotlight DOM nodes matching `selectors`. Returns false when nothing matched.
     * Calls `onDone` after the spotlight hides (timeout, click, or Escape).
     * Pass `durationMs: 0` to keep the spotlight until `dismiss()` (feature hints).
     */
    async spotlight(
      selectors: string | string[],
      options: SpotlightOptions = {},
    ): Promise<boolean> {
      const durationMs = options.durationMs ?? DEFAULT_DURATION_MS
      const pad = options.pad ?? DEFAULT_PAD
      const opacity = options.opacity ?? DEFAULT_OPACITY
      const settleMs = options.settleMs ?? DEFAULT_SETTLE_MS
      const firstOnly = Boolean(options.firstOnly)

      clearHideTimer()
      this.clear()
      doneCallback = options.onDone ?? null
      activePad = pad
      activeFirstOnly = firstOnly

      // Let dialogs/overlays finish closing / route content mount before measuring.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      await new Promise<void>((resolve) => setTimeout(resolve, settleMs))

      let elements = pickSpotlightElements(selectors, firstOnly)
      // Settings tabs / advanced panels may mount a frame later after navigation.
      for (let attempt = 0; attempt < 20 && !elements.length; attempt += 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, 80))
        elements = pickSpotlightElements(selectors, firstOnly)
      }
      if (!elements.length) {
        runDoneCallback()
        return false
      }

      const target = elements[elements.length - 1]
      if (!isElementInViewport(target)) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest',
        })
        // Wait for smooth scroll / virtual remount, then re-query live nodes.
        await new Promise<void>((resolve) => setTimeout(resolve, 360))
        elements = pickSpotlightElements(selectors, firstOnly)
        if (!elements.length) {
          runDoneCallback()
          return false
        }
      }

      this.updateViewport()
      this.holes = elements
        .map((el) => measureHole(el, pad))
        .filter((hole) => hole.width > 0 && hole.height > 0)

      if (!this.holes.length) {
        runDoneCallback()
        return false
      }

      activeSelectors = selectors
      this.opacity = opacity
      this.show = true

      if (durationMs > 0) {
        hideTimer = setTimeout(() => {
          hideTimer = null
          this.clear()
          runDoneCallback()
        }, durationMs)
      }

      return true
    },

    dismiss() {
      if (!this.show && !doneCallback) return
      clearHideTimer()
      this.clear()
      runDoneCallback()
    },
  },
})

export default useElementSpotlightStore
