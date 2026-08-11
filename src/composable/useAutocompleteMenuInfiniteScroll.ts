import {onUnmounted, nextTick, shallowRef, computed, useId, type Ref} from 'vue'
import throttle from 'lodash/throttle'

/**
 * Infinite scroll for Vuetify autocomplete/select menus.
 * Menus teleport + clip overflow, so viewport IntersectionObserver alone is unreliable —
 * bind to the menu scroll root and also listen for near-bottom scroll.
 */
export function useAutocompleteMenuInfiniteScroll(options: {
  canLoadMore: () => boolean
  isLoading: () => boolean
  loadMore: () => Promise<void>
  /** Extra classes merged into menu contentClass (e.g. custom-list). */
  baseContentClass?: string | Ref<string | undefined>
  maxHeight?: number
  thresholdPx?: number
}) {
  const thresholdPx = options.thresholdPx ?? 72
  const maxHeight = options.maxHeight ?? 360
  const instanceClass = `ac-menu-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

  const scrollRoot = shallowRef<HTMLElement | null>(null)
  let boundScrollEl: HTMLElement | null = null

  const menuProps = computed(() => {
    const base = typeof options.baseContentClass === 'string'
      ? options.baseContentClass
      : options.baseContentClass?.value
    return {
      maxHeight,
      contentClass: [base, instanceClass, 'ac-menu-infinite'].filter(Boolean).join(' '),
    }
  })

  const intersectOptions = computed(() => ({
    root: scrollRoot.value,
    rootMargin: `${thresholdPx}px 0px`,
    threshold: 0,
  }))

  function findScrollEl(): HTMLElement | null {
    const content = document.querySelector(`.${instanceClass}`) as HTMLElement | null
    if (!content) return null
    if (content.scrollHeight > content.clientHeight + 1) return content
    const list = content.querySelector('.v-list') as HTMLElement | null
    if (list && list.scrollHeight > list.clientHeight + 1) return list
    return content
  }

  function isNearBottom(el: HTMLElement): boolean {
    return el.scrollTop + el.clientHeight >= el.scrollHeight - thresholdPx
  }

  async function loadUntilSettled(): Promise<void> {
    if (!options.canLoadMore() || options.isLoading()) return
    await options.loadMore()
    await nextTick()
    const el = boundScrollEl || findScrollEl()
    if (!el || !options.canLoadMore() || options.isLoading()) return
    if (el.scrollHeight <= el.clientHeight + thresholdPx || isNearBottom(el)) {
      await loadUntilSettled()
    }
  }

  const onScroll = throttle(() => {
    const el = boundScrollEl
    if (!el || !options.canLoadMore() || options.isLoading()) return
    if (isNearBottom(el)) void loadUntilSettled()
  }, 120)

  function unbindScroll() {
    boundScrollEl?.removeEventListener('scroll', onScroll)
    boundScrollEl = null
    scrollRoot.value = null
    onScroll.cancel()
  }

  async function maybeFillMenu(): Promise<void> {
    await nextTick()
    const el = boundScrollEl || findScrollEl()
    if (!el || !options.canLoadMore() || options.isLoading()) return
    if (el.scrollHeight <= el.clientHeight + thresholdPx || isNearBottom(el)) {
      await loadUntilSettled()
    }
  }

  async function onMenuUpdate(open: boolean): Promise<void> {
    unbindScroll()
    if (!open) return
    await nextTick()
    requestAnimationFrame(() => {
      const el = findScrollEl()
      boundScrollEl = el
      scrollRoot.value = el
      el?.addEventListener('scroll', onScroll, {passive: true})
      void maybeFillMenu()
    })
  }

  onUnmounted(() => {
    unbindScroll()
  })

  return {
    menuProps,
    intersectOptions,
    onMenuUpdate,
    maybeFillMenu,
    instanceClass,
  }
}
