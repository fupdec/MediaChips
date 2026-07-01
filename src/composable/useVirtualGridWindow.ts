import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, type Ref, type ComputedRef } from 'vue'
import { getMainScrollEl } from '@/utils/mainScroll'
import {
  chunkIntoRows,
  estimateRowHeight,
  getGridGap,
  getLayoutMetrics,
  getLayoutTopInScroll,
  VIRTUAL_ROW_BUFFER,
} from '@/utils/gridLayout'
import type { MediaItem } from '@/types/stores'

interface LayoutOptions {
  size: number
  gapSize: string
  imageGrid: boolean
  wideImage: boolean
  lineGrid: boolean
  chipsGrid: boolean
  imageAspectRatio?: number
  lockRowHeight?: boolean
}

interface VirtualGridRow {
  index: number
  startIndex: number
  items: MediaItem[]
}

export function useVirtualGridWindow(
  itemsSource: ComputedRef<MediaItem[]>,
  layoutRef: Ref<HTMLElement | null>,
  layoutOptions: Ref<LayoutOptions>,
) {
  const columnCount = ref(1)
  const rowHeight = ref(320)
  const topSpacer = ref(0)
  const bottomSpacer = ref(0)
  const visibleRows = ref<VirtualGridRow[]>([])

  const allRows = computed((): VirtualGridRow[] => {
    const items = itemsSource.value || []
    return chunkIntoRows(items, columnCount.value) as VirtualGridRow[]
  })

  let scrollEl: HTMLElement | null = null
  let resizeObserver: ResizeObserver | null = null
  let scrollRaf: number | null = null
  let measureRaf: number | null = null

  const getOptions = () => ({
    size: layoutOptions.value.size,
    gapSize: layoutOptions.value.gapSize,
    imageGrid: layoutOptions.value.imageGrid,
    wideImage: layoutOptions.value.wideImage,
    lineGrid: layoutOptions.value.lineGrid,
    chipsGrid: layoutOptions.value.chipsGrid,
    imageAspectRatio: layoutOptions.value.imageAspectRatio,
    containerWidth: layoutRef.value?.clientWidth || 0,
    columnCount: columnCount.value,
  })

  const measureLayout = () => {
    const layoutEl = layoutRef.value
    if (!layoutEl) return

    const options = getOptions()
    const metrics = getLayoutMetrics(layoutEl.clientWidth, options)

    columnCount.value = metrics.columnCount

    rowHeight.value = estimateRowHeight({
      ...options,
      containerWidth: layoutEl.clientWidth,
      columnCount: columnCount.value,
    })
  }

  const measureVisibleRows = () => {
    if (layoutOptions.value.lockRowHeight) return

    const layoutEl = layoutRef.value
    if (!layoutEl) return

    const rowEls = layoutEl.querySelectorAll('.virtual-grid-row')
    if (!rowEls.length) return

    const gapY = getGridGap(layoutOptions.value.gapSize).y
    let maxHeight = 0
    rowEls.forEach((rowEl) => {
      maxHeight = Math.max(maxHeight, (rowEl as HTMLElement).offsetHeight)
    })

    const rowStride = maxHeight + gapY
    if (maxHeight > 0 && Math.abs(rowStride - rowHeight.value) > 6) {
      rowHeight.value = rowStride
      updateWindow(false)
    }
  }

  const updateWindow = (scheduleMeasure = true) => {
    const layoutEl = layoutRef.value
    if (!layoutEl) return

    const rows = allRows.value
    if (!rows.length) {
      visibleRows.value = []
      topSpacer.value = 0
      bottomSpacer.value = 0
      return
    }

    if (!scrollEl) {
      visibleRows.value = rows
      topSpacer.value = 0
      bottomSpacer.value = 0
      return
    }

    const layoutTop = getLayoutTopInScroll(layoutEl, scrollEl)
    const scrollTop = scrollEl.scrollTop
    const viewportHeight = scrollEl.clientHeight
    const rh = Math.max(rowHeight.value, 1)
    const totalGridHeight = rows.length * rh

    const viewportStart = scrollTop
    const viewportEnd = scrollTop + viewportHeight
    const visibleGridStart = Math.max(0, viewportStart - layoutTop)
    const visibleGridEnd = Math.min(totalGridHeight, viewportEnd - layoutTop)

    if (visibleGridEnd <= visibleGridStart) {
      visibleRows.value = []
      topSpacer.value = 0
      bottomSpacer.value = totalGridHeight
      return
    }

    let start = Math.floor(visibleGridStart / rh) - VIRTUAL_ROW_BUFFER
    let end = Math.ceil(visibleGridEnd / rh) + VIRTUAL_ROW_BUFFER

    start = Math.max(0, start)
    end = Math.min(rows.length, end)

    if (end <= start) {
      end = Math.min(rows.length, start + VIRTUAL_ROW_BUFFER * 2 + 1)
    }

    topSpacer.value = start * rh
    bottomSpacer.value = (rows.length - end) * rh
    visibleRows.value = rows.slice(start, end)

    if (scheduleMeasure) {
      if (measureRaf) cancelAnimationFrame(measureRaf)
      measureRaf = requestAnimationFrame(() => {
        nextTick(measureVisibleRows)
      })
    }
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
        measureLayout()
        updateWindow()
      })
      resizeObserver.observe(layoutRef.value)
    }

    measureLayout()
    updateWindow(false)
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
    if (measureRaf) cancelAnimationFrame(measureRaf)
  }

  onMounted(() => {
    nextTick(tryBind)
  })
  onBeforeUnmount(unbind)

  watch(itemsSource, () => {
    measureLayout()
    nextTick(() => updateWindow())
  })

  watch(layoutOptions, () => {
    measureLayout()
    updateWindow()
  }, { deep: true })

  return {
    visibleRows,
    topSpacer,
    bottomSpacer,
    columnCount,
    rowHeight,
    measureLayout,
    updateWindow,
  }
}
