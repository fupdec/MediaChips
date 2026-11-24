import {
  computed,
  onBeforeUnmount,
  ref,
  watch,
  type ComputedRef,
  type Ref,
} from 'vue'
import { getGridLayoutStyle, type GridLayoutOptions } from '@/utils/gridLayout'

export function useResponsiveGridLayout(
  layoutRef: Ref<HTMLElement | null>,
  layoutOptions: Ref<GridLayoutOptions> | ComputedRef<GridLayoutOptions>,
) {
  const containerWidth = ref(0)

  const gridStyle = computed(() => {
    const style = getGridLayoutStyle({
      ...layoutOptions.value,
      containerWidth: containerWidth.value,
    })
    // Until ResizeObserver reports a width the cards use a fallback size and would
    // jump to the real one (a layout shift). Hidden boxes keep their layout but are
    // not painted or counted; the measure arrives before the next paint. Reading
    // clientWidth here instead would force a layout on mount.
    return containerWidth.value > 0 ? style : {...style, visibility: 'hidden'}
  })


  let resizeObserver: ResizeObserver | null = null

  const measure = () => {
    containerWidth.value = layoutRef.value?.clientWidth || 0
  }

  const bindObserver = (el: HTMLElement) => {
    unbindObserver()
    if (typeof ResizeObserver === 'undefined') {
      measure()
      return
    }

    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries.find(entry => entry.target === el)
      if (entry) containerWidth.value = entry.contentRect.width
    })
    resizeObserver.observe(el)
  }

  const unbindObserver = () => {
    resizeObserver?.disconnect()
    resizeObserver = null
  }

  watch(layoutRef, (el) => {
    if (el) bindObserver(el)
    else unbindObserver()
  }, { immediate: true })

  onBeforeUnmount(unbindObserver)

  return { gridStyle, containerWidth, measure }
}
