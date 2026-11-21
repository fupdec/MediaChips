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

  const gridStyle = computed(() => getGridLayoutStyle({
    ...layoutOptions.value,
    containerWidth: containerWidth.value,
  }))


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
