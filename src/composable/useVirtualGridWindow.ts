import { ref, watch, onMounted, onBeforeUnmount, nextTick, type Ref, type ComputedRef } from 'vue'
import { getMainScrollEl } from '@/utils/mainScroll'
import {
  averageMeasuredRowStride,
  estimateRowHeight,
  findVariableRowAtOffset,
  getGridGap,
  getLayoutMetrics,
  getLayoutTopInScroll,
  getVariableGridHeight,
  getVariableRowOffset,
  VIRTUAL_ROW_BUFFER,
} from '@/utils/gridLayout'

interface LayoutOptions {
  size: number
  gapSize: string
  imageGrid: boolean
  wideImage: boolean
  lineGrid: boolean
  listGrid?: boolean
  chipsGrid: boolean
  imageOnly?: boolean
  imageAspectRatio?: number
  lockRowHeight?: boolean
  /** When set, used instead of media-card estimateRowHeight (e.g. folder tiles). */
  rowHeightOverride?: number
  /** Absolute index of items[0] in the full filtered list (after top trim). */
  windowStart?: number
  /** Full filtered list length for scrollbar extent (defaults to windowStart + items). */
  totalCount?: number
}

export interface VirtualGridRow<T> {
  index: number
  startIndex: number
  items: T[]
  /** Prior measured content height — keeps remounts from collapsing then growing. */
  contentMinHeight?: number
}

export function useVirtualGridWindow<T>(
  itemsSource: ComputedRef<T[]>,
  layoutRef: Ref<HTMLElement | null>,
  layoutOptions: Ref<LayoutOptions> | ComputedRef<LayoutOptions>,
) {
  const columnCount = ref(1)
  /** Locked stride, or average measured stride for seekers (`data-row-height`). */
  const rowHeight = ref(320)
  /** Fresh estimate used when nothing is measured yet. */
  const estimatedStride = ref(320)
  const topSpacer = ref(0)
  const bottomSpacer = ref(0)
  const dataStartTop = ref(0)
  const dataEndTop = ref(0)
  const totalGridHeight = ref(0)
  const visibleRows = ref<VirtualGridRow<T>[]>([])
  let lastWindowStart = -1
  let lastLoadedEnd = 0

  const measuredStrides = new Map<number, number>()
  let scrollEl: HTMLElement | null = null
  let resizeObserver: ResizeObserver | null = null
  let rowResizeObserver: ResizeObserver | null = null
  let scrollRaf: number | null = null
  let measureRaf: number | null = null
  let scrollIdleTimer: ReturnType<typeof setTimeout> | null = null
  let isScrollActive = false
  let layoutSignature = ''

  /** After fling/drag settles, remeasure once for late layout (chips/thumbs). */
  const SCROLL_IDLE_MEASURE_MS = 90

  const getOptions = () => ({
    size: layoutOptions.value.size,
    gapSize: layoutOptions.value.gapSize,
    imageGrid: layoutOptions.value.imageGrid,
    wideImage: layoutOptions.value.wideImage,
    lineGrid: layoutOptions.value.lineGrid,
    listGrid: Boolean(layoutOptions.value.listGrid),
    chipsGrid: layoutOptions.value.chipsGrid,
    imageOnly: Boolean(layoutOptions.value.imageOnly),
    imageAspectRatio: layoutOptions.value.imageAspectRatio,
    containerWidth: layoutRef.value?.clientWidth || 0,
    columnCount: columnCount.value,
  })

  const isLocked = () => Boolean(layoutOptions.value.lockRowHeight)

  /**
   * Static estimate for phantom/total height. Do not replace with the measured
   * average — that rewrites totalHeight and makes the scrollbar thumb jump.
   */
  const phantomStride = () => Math.max(1, estimatedStride.value)

  const clearMeasuredStrides = () => {
    measuredStrides.clear()
  }

  const pruneMeasuredStrides = (totalRows: number) => {
    if (!measuredStrides.size) return
    for (const key of measuredStrides.keys()) {
      if (key < 0 || key >= totalRows) measuredStrides.delete(key)
    }
  }

  const resolveExtent = () => {
    const items = itemsSource.value || []
    const cols = Math.max(1, columnCount.value)
    const windowStart = Math.max(0, Number(layoutOptions.value.windowStart) || 0)
    const totalCount = Math.max(
      windowStart + items.length,
      Number(layoutOptions.value.totalCount) || 0,
      items.length,
    )
    const totalRows = totalCount > 0 ? Math.ceil(totalCount / cols) : 0
    const dataStartRow = items.length ? Math.floor(windowStart / cols) : 0
    const dataEndRow = items.length
      ? Math.min(totalRows, Math.ceil((windowStart + items.length) / cols))
      : 0
    const loadedEnd = windowStart + items.length

    // Keep measurements across sequential trim/append. Far scrollbar jumps land
    // in a non-overlapping window — drop stale strides so spacers match estimates
    // and ratio seeks can pin the viewport onto the new cards.
    if (windowStart !== lastWindowStart || loadedEnd !== lastLoadedEnd) {
      const prevStart = lastWindowStart
      const prevEnd = lastLoadedEnd
      const overlaps = prevStart >= 0 && prevStart < loadedEnd && windowStart < prevEnd
      lastWindowStart = windowStart
      lastLoadedEnd = loadedEnd
      if (prevStart >= 0 && !overlaps) {
        clearMeasuredStrides()
      }
    }

    pruneMeasuredStrides(totalRows)

    return { items, cols, windowStart, totalCount, totalRows, dataStartRow, dataEndRow }
  }

  const buildRow = (
    rowIndex: number,
    cols: number,
    items: T[],
    windowStart: number,
    totalCount: number,
    gapY: number,
  ): VirtualGridRow<T> => {
    const startIndex = rowIndex * cols
    const rowItems: T[] = []
    for (let col = 0; col < cols; col += 1) {
      const absoluteIndex = startIndex + col
      if (absoluteIndex >= totalCount) break
      const localIndex = absoluteIndex - windowStart
      if (localIndex >= 0 && localIndex < items.length) {
        rowItems.push(items[localIndex])
      }
    }
    const known = measuredStrides.get(rowIndex)
    return {
      index: rowIndex,
      startIndex,
      items: rowItems,
      contentMinHeight: known != null && known > gapY
        ? Math.round(known - gapY)
        : undefined,
    }
  }

  const syncExposedRowHeight = () => {
    if (isLocked()) return
    // Expose average for near-window seekers only; keep estimatedStride static.
    rowHeight.value = averageMeasuredRowStride(measuredStrides, phantomStride())
  }

  const scheduleMeasureVisibleRows = () => {
    if (isLocked()) return
    if (measureRaf) cancelAnimationFrame(measureRaf)
    measureRaf = requestAnimationFrame(() => {
      measureRaf = null
      nextTick(measureVisibleRows)
    })
  }

  const observeVisibleRows = () => {
    if (isLocked() || !rowResizeObserver || !layoutRef.value) return
    rowResizeObserver.disconnect()
    layoutRef.value.querySelectorAll('.virtual-grid-row').forEach((el) => {
      rowResizeObserver?.observe(el)
    })
  }

  const measureLayout = () => {
    const layoutEl = layoutRef.value
    if (!layoutEl) return

    const options = getOptions()
    const metrics = getLayoutMetrics(layoutEl.clientWidth, options)
    const nextCols = metrics.columnCount
    const nextSignature = [
      nextCols,
      options.size,
      options.gapSize,
      options.imageOnly ? 1 : 0,
      options.lineGrid ? 1 : 0,
      options.listGrid ? 1 : 0,
      options.chipsGrid ? 1 : 0,
      options.imageGrid ? 1 : 0,
      isLocked() ? 1 : 0,
      layoutOptions.value.rowHeightOverride ?? 0,
    ].join(':')

    if (nextSignature !== layoutSignature) {
      layoutSignature = nextSignature
      clearMeasuredStrides()
    }

    columnCount.value = nextCols

    const override = layoutOptions.value.rowHeightOverride
    if (override != null && override > 0) {
      estimatedStride.value = override
      rowHeight.value = override
      return
    }

    const estimated = estimateRowHeight({
      ...options,
      containerWidth: layoutEl.clientWidth,
      columnCount: columnCount.value,
    })
    estimatedStride.value = estimated
    if (isLocked() || measuredStrides.size === 0) {
      rowHeight.value = estimated
    } else {
      syncExposedRowHeight()
    }
  }

  const measureVisibleRows = () => {
    if (isLocked()) return

    const layoutEl = layoutRef.value
    if (!layoutEl) return

    const rowEls = layoutEl.querySelectorAll('.virtual-grid-row')
    if (!rowEls.length) return

    const gapY = getGridGap(layoutOptions.value.gapSize).y

    let changed = false
    rowEls.forEach((node) => {
      const rowEl = node as HTMLElement
      const index = Number(rowEl.dataset.rowIndex)
      if (!Number.isFinite(index) || index < 0) return
      const contentHeight = rowEl.offsetHeight
      if (contentHeight <= 0) return
      const stride = contentHeight + gapY
      const prev = measuredStrides.get(index)
      if (prev == null || Math.abs(prev - stride) > 2) {
        measuredStrides.set(index, stride)
        changed = true
      }
    })

    if (!changed) {
      observeVisibleRows()
      return
    }

    syncExposedRowHeight()
    // Never rewrite scrollTop here — that fought scrollbar seeks and jerked the grid.
    // Spacers update from measured strides; phantom height stays on static estimate.
    updateWindow(false)
    nextTick(observeVisibleRows)
  }

  const updateWindowLocked = (
    scheduleMeasure: boolean,
    extent: ReturnType<typeof resolveExtent>,
  ) => {
    const {
      items,
      cols,
      windowStart,
      totalCount,
      totalRows,
      dataStartRow,
      dataEndRow,
    } = extent
    const rh = Math.max(rowHeight.value, 1)
    const gapY = getGridGap(layoutOptions.value.gapSize).y
    const gridHeight = totalRows * rh
    totalGridHeight.value = gridHeight
    dataStartTop.value = dataStartRow * rh
    dataEndTop.value = dataEndRow * rh

    if (!totalRows) {
      visibleRows.value = []
      topSpacer.value = 0
      bottomSpacer.value = 0
      dataStartTop.value = 0
      dataEndTop.value = 0
      return
    }

    if (!scrollEl) {
      const rows: VirtualGridRow<T>[] = []
      for (let rowIndex = dataStartRow; rowIndex < dataEndRow; rowIndex += 1) {
        rows.push(buildRow(rowIndex, cols, items, windowStart, totalCount, gapY))
      }
      visibleRows.value = rows
      topSpacer.value = dataStartRow * rh
      bottomSpacer.value = Math.max(0, gridHeight - topSpacer.value - rows.length * rh)
      return
    }

    const layoutEl = layoutRef.value
    if (!layoutEl) return

    const layoutTop = getLayoutTopInScroll(layoutEl, scrollEl)
    const scrollTop = scrollEl.scrollTop
    const viewportHeight = scrollEl.clientHeight
    const visibleGridStart = Math.max(0, scrollTop - layoutTop)
    const visibleGridEnd = Math.min(gridHeight, scrollTop + viewportHeight - layoutTop)

    if (visibleGridEnd <= visibleGridStart) {
      visibleRows.value = []
      topSpacer.value = 0
      bottomSpacer.value = gridHeight
      return
    }

    let start = Math.floor(visibleGridStart / rh) - VIRTUAL_ROW_BUFFER
    let end = Math.ceil(visibleGridEnd / rh) + VIRTUAL_ROW_BUFFER
    start = Math.max(0, start)
    end = Math.min(totalRows, end)
    start = Math.max(start, dataStartRow)
    end = Math.min(end, dataEndRow)

    if (end <= start) {
      visibleRows.value = []
      if (visibleGridStart >= dataEndTop.value) {
        topSpacer.value = dataEndTop.value
        bottomSpacer.value = Math.max(0, gridHeight - dataEndTop.value)
      } else {
        topSpacer.value = Math.min(dataStartRow * rh, gridHeight)
        bottomSpacer.value = Math.max(0, gridHeight - topSpacer.value)
      }
      return
    }

    const rows: VirtualGridRow<T>[] = []
    for (let rowIndex = start; rowIndex < end; rowIndex += 1) {
      rows.push(buildRow(rowIndex, cols, items, windowStart, totalCount, gapY))
    }

    topSpacer.value = start * rh
    bottomSpacer.value = Math.max(0, gridHeight - topSpacer.value - rows.length * rh)
    visibleRows.value = rows

    if (scheduleMeasure) {
      // Locked mode never measures variable heights.
    }
  }

  const updateWindowVariable = (
    scheduleMeasure: boolean,
    extent: ReturnType<typeof resolveExtent>,
  ) => {
    const {
      items,
      cols,
      windowStart,
      totalCount,
      totalRows,
      dataStartRow,
      dataEndRow,
    } = extent
    const estimated = phantomStride()
    const gapY = getGridGap(layoutOptions.value.gapSize).y
    const gridHeight = getVariableGridHeight(totalRows, measuredStrides, estimated)
    totalGridHeight.value = gridHeight
    dataStartTop.value = getVariableRowOffset(dataStartRow, measuredStrides, estimated)
    dataEndTop.value = getVariableRowOffset(dataEndRow, measuredStrides, estimated)

    if (!totalRows) {
      visibleRows.value = []
      topSpacer.value = 0
      bottomSpacer.value = 0
      dataStartTop.value = 0
      dataEndTop.value = 0
      return
    }

    if (!scrollEl) {
      const rows: VirtualGridRow<T>[] = []
      for (let rowIndex = dataStartRow; rowIndex < dataEndRow; rowIndex += 1) {
        rows.push(buildRow(rowIndex, cols, items, windowStart, totalCount, gapY))
      }
      visibleRows.value = rows
      topSpacer.value = dataStartTop.value
      bottomSpacer.value = Math.max(0, gridHeight - dataEndTop.value)
      if (scheduleMeasure) scheduleMeasureVisibleRows()
      return
    }

    const layoutEl = layoutRef.value
    if (!layoutEl) return

    const layoutTop = getLayoutTopInScroll(layoutEl, scrollEl)
    const scrollTop = scrollEl.scrollTop
    const viewportHeight = scrollEl.clientHeight
    const visibleGridStart = Math.max(0, scrollTop - layoutTop)
    const visibleGridEnd = Math.min(gridHeight, scrollTop + viewportHeight - layoutTop)

    if (visibleGridEnd <= visibleGridStart) {
      visibleRows.value = []
      topSpacer.value = 0
      bottomSpacer.value = gridHeight
      return
    }

    let start = findVariableRowAtOffset(
      visibleGridStart,
      totalRows,
      measuredStrides,
      estimated,
    ) - VIRTUAL_ROW_BUFFER
    let end = findVariableRowAtOffset(
      visibleGridEnd,
      totalRows,
      measuredStrides,
      estimated,
    ) + 1 + VIRTUAL_ROW_BUFFER

    start = Math.max(0, start)
    end = Math.min(totalRows, end)
    start = Math.max(start, dataStartRow)
    end = Math.min(end, dataEndRow)

    // Estimates are often taller than natural cards — mount extra rows so the
    // viewport does not show a blank band under a short measured strip.
    if (end > start) {
      const minStride = Math.max(120, Math.round(estimated * 0.6))
      const minRows = Math.ceil(viewportHeight / minStride) + VIRTUAL_ROW_BUFFER
      end = Math.min(dataEndRow, Math.max(end, start + minRows))
    }

    if (end <= start) {
      // Viewport sits in a phantom zone (trimmed head / unloaded tail). Keep
      // spacers so the scrollbar extent stays correct; infinite-scroll jump
      // reloads items for this offset via data-total-height ratio seek.
      visibleRows.value = []
      if (visibleGridStart >= dataEndTop.value) {
        topSpacer.value = dataEndTop.value
        bottomSpacer.value = Math.max(0, gridHeight - dataEndTop.value)
      } else {
        topSpacer.value = Math.min(
          getVariableRowOffset(dataStartRow, measuredStrides, estimated),
          gridHeight,
        )
        bottomSpacer.value = Math.max(0, gridHeight - topSpacer.value)
      }
      return
    }

    const rows: VirtualGridRow<T>[] = []
    for (let rowIndex = start; rowIndex < end; rowIndex += 1) {
      rows.push(buildRow(rowIndex, cols, items, windowStart, totalCount, gapY))
    }

    topSpacer.value = getVariableRowOffset(start, measuredStrides, estimated)
    bottomSpacer.value = Math.max(
      0,
      gridHeight - getVariableRowOffset(end, measuredStrides, estimated),
    )
    visibleRows.value = rows

    if (scheduleMeasure) scheduleMeasureVisibleRows()
    else nextTick(observeVisibleRows)
  }

  const updateWindow = (scheduleMeasure = true) => {
    const layoutEl = layoutRef.value
    if (!layoutEl) return

    const extent = resolveExtent()
    if (isLocked()) {
      updateWindowLocked(scheduleMeasure, extent)
      return
    }
    updateWindowVariable(scheduleMeasure, extent)
  }

  const onScroll = () => {
    isScrollActive = true
    if (scrollIdleTimer) clearTimeout(scrollIdleTimer)
    scrollIdleTimer = setTimeout(() => {
      scrollIdleTimer = null
      isScrollActive = false
      // One settle pass — avoid measuring on every scroll frame.
      scheduleMeasureVisibleRows()
    }, SCROLL_IDLE_MEASURE_MS)

    if (scrollRaf) cancelAnimationFrame(scrollRaf)
    // Window only: measuring mid-fling fights the compositor and causes jumps.
    scrollRaf = requestAnimationFrame(() => updateWindow(false))
  }

  const bind = () => {
    unbind()
    scrollEl = getMainScrollEl() as HTMLElement | null
    scrollEl?.addEventListener('scroll', onScroll, { passive: true })

    if (layoutRef.value && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        measureLayout()
        updateWindow(false)
        scheduleMeasureVisibleRows()
      })
      resizeObserver.observe(layoutRef.value)

      rowResizeObserver = new ResizeObserver(() => {
        // Ignore transient resizes while the user is actively scrolling.
        if (isScrollActive) return
        scheduleMeasureVisibleRows()
      })
    }

    measureLayout()
    updateWindow(false)
    if (!isLocked()) {
      nextTick(measureVisibleRows)
    }
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

    if (rowResizeObserver) {
      rowResizeObserver.disconnect()
      rowResizeObserver = null
    }

    if (scrollRaf) cancelAnimationFrame(scrollRaf)
    if (measureRaf) cancelAnimationFrame(measureRaf)
    if (scrollIdleTimer) {
      clearTimeout(scrollIdleTimer)
      scrollIdleTimer = null
    }
    isScrollActive = false
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
    dataStartTop,
    dataEndTop,
    totalGridHeight,
    columnCount,
    rowHeight,
    measureLayout,
    updateWindow,
  }
}
