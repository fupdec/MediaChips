import {onMounted, onUnmounted, ref, watch, type WatchSource} from 'vue'
import {getMainScrollEl, isElementVerticallyScrollable} from '@/utils/mainScroll'

interface UseMainScrollOverflowOptions {
  /** Re-measure when these reactive sources change (e.g. item count). */
  watchSources?: WatchSource[]
}

export function useMainScrollOverflow(options: UseMainScrollOverflowOptions = {}) {
  const mainScrollOverflowing = ref(false)
  let resizeObservers: ResizeObserver[] = []
  let rafId: number | null = null

  function measure(): void {
    mainScrollOverflowing.value = isElementVerticallyScrollable(getMainScrollEl())
  }

  function scheduleMeasure(): void {
    if (rafId != null) cancelAnimationFrame(rafId)
    rafId = requestAnimationFrame(() => {
      rafId = null
      measure()
    })
  }

  function setupObservers(): void {
    teardownObservers()

    const scrollEl = getMainScrollEl()
    if (!scrollEl) {
      mainScrollOverflowing.value = false
      return
    }

    const onResize = (): void => scheduleMeasure()
    const scrollObserver = new ResizeObserver(onResize)
    scrollObserver.observe(scrollEl)
    resizeObservers.push(scrollObserver)

    const inner = scrollEl.querySelector('.main-scroll-inner')
    if (inner instanceof Element) {
      const innerObserver = new ResizeObserver(onResize)
      innerObserver.observe(inner)
      resizeObservers.push(innerObserver)
    }

    scheduleMeasure()
  }

  function teardownObservers(): void {
    resizeObservers.forEach(observer => observer.disconnect())
    resizeObservers = []
    if (rafId != null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  onMounted(() => {
    setupObservers()
    window.addEventListener('resize', scheduleMeasure, {passive: true})
  })

  onUnmounted(() => {
    teardownObservers()
    window.removeEventListener('resize', scheduleMeasure)
  })

  if (options.watchSources?.length) {
    watch(options.watchSources, () => scheduleMeasure(), {flush: 'post'})
  }

  return {
    mainScrollOverflowing,
    remeasureMainScrollOverflow: scheduleMeasure,
  }
}
