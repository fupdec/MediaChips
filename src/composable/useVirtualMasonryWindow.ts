import {
  ref,
  watch,
  onMounted,
  onBeforeUnmount,
  nextTick,
  type Ref,
  type ComputedRef,
} from 'vue'
import { getMainScrollEl } from '@/utils/mainScroll'
import {
  buildMasonryLayout,
  estimateMasonryItemHeight,
  findVisibleMasonryItems,
  getGridGap,
  getLayoutMetrics,
  getLayoutTopInScroll,
  type MasonryItemPosition,
  type MasonryLayout,
} from '@/utils/gridLayout'
import type { MediaItem } from '@/types/stores'

interface MasonryLayoutOptions {
  size: number
  gapSize: string
}

export function useVirtualMasonryWindow(
  itemsSource: ComputedRef<MediaItem[]>,
  layoutRef: Ref<HTMLElement | null>,
  layoutOptions: Ref<MasonryLayoutOptions>,
  virtualEnabled: Ref<boolean>,
) {
  const columnCount = ref(1)
  const columnWidth = ref(200)
  const gap = ref(getGridGap('xs'))
  const totalHeight = ref(0)
  const visibleItems = ref<MasonryItemPosition<MediaItem>[]>([])
  const masonryLayout = ref<MasonryLayout<MediaItem> | null>(null)

  let scrollEl: HTMLElement | null = null
  let resizeObserver: ResizeObserver | null = null
  let scrollRaf: number | null = null

  const getLayoutOptions = () => ({
    size: layoutOptions.value.size,
    gapSize: layoutOptions.value.gapSize,
    imageGrid: true,
    containerWidth: layoutRef.value?.clientWidth || 0,
  })

  const measureLayout = () => {
    const layoutEl = layoutRef.value
    if (!layoutEl) return

    const options = getLayoutOptions()
    const nextGap = getGridGap(options.gapSize)
    const metrics = getLayoutMetrics(layoutEl.clientWidth, options)

    columnCount.value = metrics.columnCount
    columnWidth.value = metrics.cardWidth
    gap.value = nextGap
  }

  const rebuildLayout = () => {
    measureLayout()

    const items = itemsSource.value || []
    if (!items.length) {
      masonryLayout.value = null
      totalHeight.value = 0
      visibleItems.value = []
      return
    }

    masonryLayout.value = buildMasonryLayout(
      items,
      Math.min(columnCount.value, Math.max(1, items.length)),
      columnWidth.value,
      gap.value.x,
      gap.value.y,
      estimateMasonryItemHeight,
    )
    totalHeight.value = masonryLayout.value?.totalHeight ?? 0
    // Do not ratio-scale scrollTop here: append/loadMore grows height below the
    // viewport and must keep the absolute scroll position (ratio jumps to the end).
  }

  const updateWindow = () => {
    const layout = masonryLayout.value
    if (!layout) {
      visibleItems.value = []
      return
    }

    if (!virtualEnabled.value || !scrollEl) {
      visibleItems.value = layout.positions
      return
    }

    const layoutEl = layoutRef.value
    if (!layoutEl) return

    const layoutTop = getLayoutTopInScroll(layoutEl, scrollEl)
    const scrollTop = scrollEl.scrollTop
    const viewportHeight = scrollEl.clientHeight
    const visibleStart = scrollTop - layoutTop
    const visibleEnd = visibleStart + viewportHeight

    visibleItems.value = findVisibleMasonryItems(
      layout.positions,
      visibleStart,
      visibleEnd,
    )
  }

  const onScroll = () => {
    if (scrollRaf) cancelAnimationFrame(scrollRaf)
    scrollRaf = requestAnimationFrame(() => updateWindow())
  }

  const bind = () => {
    unbind()
    scrollEl = getMainScrollEl() as HTMLElement | null
    scrollEl?.addEventListener('scroll', onScroll, { passive: true })

    if (layoutRef.value && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        rebuildLayout()
        updateWindow()
      })
      resizeObserver.observe(layoutRef.value)
    }

    rebuildLayout()
    updateWindow()
  }

  let bindAttempts = 0

  const tryBind = () => {
    bind()
    if (!scrollEl && bindAttempts < 20) {
      bindAttempts += 1
      requestAnimationFrame(tryBind)
    }
  }

  const unbind = () => {
    if (scrollEl) {
      scrollEl.removeEventListener('scroll', onScroll)
      scrollEl = null
    }

    if (resizeObserver) {
      resizeObserver.disconnect()
      resizeObserver = null
    }

    if (scrollRaf) cancelAnimationFrame(scrollRaf)
  }

  onMounted(() => {
    nextTick(tryBind)
  })
  onBeforeUnmount(unbind)

  watch(itemsSource, () => {
    rebuildLayout()
    nextTick(() => updateWindow())
  })

  watch(layoutOptions, () => {
    rebuildLayout()
    updateWindow()
  }, { deep: true })

  watch(virtualEnabled, () => {
    updateWindow()
  })

  const itemStyle = (position: MasonryItemPosition<MediaItem>) => {
    const layout = masonryLayout.value
    if (!layout) return {}

    return {
      top: `${position.top}px`,
      left: `${position.column * (layout.columnWidth + layout.gapX)}px`,
      width: `${layout.columnWidth}px`,
    }
  }

  return {
    visibleItems,
    totalHeight,
    columnWidth,
    columnCount,
    masonryLayout,
    itemStyle,
    measureLayout,
    rebuildLayout,
    updateWindow,
  }
}
