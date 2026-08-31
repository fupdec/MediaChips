import {computed, onBeforeUnmount, onMounted, ref, watch, type MaybeRefOrGetter, toValue} from 'vue'
import {useNavigationLayout} from '@/composable/useNavigationLayout'
import {useSettingsStore} from '@/stores/settings'

/**
 * Prefer the card/list grid so the floating bar stays inside it.
 * Control deck / page container are fallbacks when the grid is unmounted.
 */
const ANCHOR_SELECTORS = [
  '.items-page-grid',
  '.items-virtual-grid',
  '#items-control-deck',
  '.items-control-deck',
  '.items-layout-container',
  '.all-tags-page',
]

/** Layout shells that resize when the sidebar / inspector / bottom nav change. */
const LAYOUT_OBSERVE_SELECTORS = [
  '.v-main',
  '.app-main-layout',
  '.main-scroll',
]

export type FixedGridBarBoundsOptions = {
  getAnchor?: MaybeRefOrGetter<HTMLElement | null | undefined>
}

export function resolveFixedGridBarAnchor(root?: ParentNode | null): HTMLElement | null {
  const scope = root ?? (typeof document === 'undefined' ? null : document)
  if (!scope) return null
  for (const selector of ANCHOR_SELECTORS) {
    const el = scope.querySelector<HTMLElement>(selector)
    if (el) return el
  }
  return null
}

/**
 * Horizontal placement is CSS `--v-layout-left/right` (drawer-aware).
 * JS only copies the grid's width so a max-width-centered container still matches.
 */
export function useFixedGridBarBounds(options: FixedGridBarBoundsOptions = {}) {
  const {useBottomBar} = useNavigationLayout()
  const settingsStore = useSettingsStore()
  const barWidth = ref<number | null>(null)

  const barStyle = computed(() => {
    if (barWidth.value == null) return {}
    return {
      maxWidth: `${barWidth.value}px`,
    }
  })

  function resolveAnchor(): HTMLElement | null {
    const provided = options.getAnchor ? toValue(options.getAnchor) : null
    if (provided) return provided
    return resolveFixedGridBarAnchor()
  }

  function syncBounds() {
    const el = resolveAnchor()
    if (!el) {
      barWidth.value = null
      return
    }
    barWidth.value = Math.round(el.getBoundingClientRect().width)
  }

  let resizeObserver: ResizeObserver | null = null

  function observeGrid() {
    resizeObserver?.disconnect()
    resizeObserver = null
    if (typeof ResizeObserver === 'undefined') return
    resizeObserver = new ResizeObserver(syncBounds)
    const seen = new Set<Element>()
    const observe = (node: Element | null | undefined) => {
      if (!node || seen.has(node)) return
      seen.add(node)
      resizeObserver?.observe(node)
    }
    const el = resolveAnchor()
    observe(el)
    observe(el?.parentElement)
    if (typeof document !== 'undefined') {
      for (const selector of LAYOUT_OBSERVE_SELECTORS) {
        observe(document.querySelector(selector))
      }
    }
  }

  onMounted(() => {
    syncBounds()
    observeGrid()
    window.addEventListener('resize', syncBounds)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', syncBounds)
    resizeObserver?.disconnect()
    resizeObserver = null
  })

  watch(useBottomBar, () => {
    syncBounds()
  })

  watch(
    () => [settingsStore.sidebarCollapsed, settingsStore.inspectorCollapsed] as const,
    () => {
      syncBounds()
      requestAnimationFrame(syncBounds)
    },
  )

  if (options.getAnchor) {
    watch(() => toValue(options.getAnchor), () => {
      observeGrid()
      syncBounds()
    })
  }

  return {
    barStyle,
    useBottomBar,
    syncBounds,
    observeGrid,
  }
}
