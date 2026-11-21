import {onMounted, onUnmounted, ref, watch, type WatchSource} from 'vue'
import {getMainScrollEl} from '@/utils/mainScroll'

interface UseMainScrollOverflowOptions {
  watchSources?: WatchSource[]
}

/** Compare observer-supplied sizes; never force layout by reading scrollHeight. */
export function useMainScrollOverflow(options: UseMainScrollOverflowOptions = {}) {
  const mainScrollOverflowing = ref(false)
  let observer: ResizeObserver | null = null
  let scrollEl: Element | null = null
  let inner: Element | null = null
  let viewportHeight: number | null = null
  let contentHeight: number | null = null

  function setupObservers(): void {
    const nextScroll = getMainScrollEl()
    const nextInner = nextScroll?.querySelector('.main-scroll-inner') ?? null
    if (observer && nextScroll === scrollEl && nextInner === inner) return
    observer?.disconnect()
    observer = null
    scrollEl = nextScroll
    inner = nextInner
    viewportHeight = contentHeight = null
    mainScrollOverflowing.value = false
    if (!scrollEl || !inner || typeof ResizeObserver === 'undefined') return

    observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === scrollEl) viewportHeight = entry.contentRect.height
        if (entry.target === inner) {
          contentHeight = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height
        }
      }
      if (viewportHeight != null && contentHeight != null) {
        mainScrollOverflowing.value = contentHeight > viewportHeight + 1
      }
    })
    observer.observe(scrollEl)
    observer.observe(inner, {box: 'border-box'})
  }

  onMounted(setupObservers)
  onUnmounted(() => observer?.disconnect())
  if (options.watchSources?.length) {
    // Rebind if a route replaced the scroll surface; sizes arrive asynchronously.
    watch(options.watchSources, setupObservers, {flush: 'post'})
  }
  return {
    mainScrollOverflowing,
    remeasureMainScrollOverflow: setupObservers,
  }
}
