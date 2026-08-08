/** Fixed card widths per size (XS=1 … XXL=6). Single source of truth for layout. */
export const CARD_WIDTH: Record<string, Record<number, number>> = {
  default: { 1: 150, 2: 200, 3: 255, 4: 315, 5: 405, 6: 520 },
  image: { 1: 140, 2: 185, 3: 235, 4: 305, 5: 390, 6: 490 },
  wide: { 1: 200, 2: 255, 3: 315, 4: 395, 5: 485, 6: 600 },
}

/** Approximate chip width for virtual row chunking in tag chip view. */
const CHIP_WIDTH: Record<number, number> = { 1: 80, 2: 100, 3: 120, 4: 150, 5: 180, 6: 220 }

/** Chip item height + bottom margin used by virtual row estimates. */
const CHIP_ROW_HEIGHT: Record<number, number> = {
  1: 34,
  2: 42,
  3: 46,
  4: 52,
  5: 62,
  6: 80,
}

const GAP_SIZE: Record<string, { x: number; y: number }> = {
  compact: { x: 8, y: 8 },
  xs: { x: 10, y: 15 },
  s: { x: 15, y: 20 },
  m: { x: 20, y: 25 },
  l: { x: 25, y: 30 },
  xl: { x: 30, y: 35 },
}

/**
 * Initial estimate for the meta block under the 16:9 preview.
 * Standard card rows measure natural height after paint; far scrollbar seeks
 * may use this average and stay approximate.
 */
const DESCRIPTION_HEIGHT: Record<number, number> = {
  1: 118,
  2: 128,
  3: 140,
  4: 152,
  5: 164,
  6: 178,
}

export function getCardDescriptionHeight(size = 3): number {
  const key = Number(size)
  return DESCRIPTION_HEIGHT[key] || DESCRIPTION_HEIGHT[3]
}

/** Legacy timeline row table (kept for parity with skeleton estimates). */
export const LINE_ROW_HEIGHT: Record<number, number> = {
  1: 100, 2: 120, 3: 130, 4: 140, 5: 160, 6: 180,
}

/** Filename line under the thumb in minimalism (view 4). */
const MINIMAL_FILENAME_HEIGHT = 28

/** v-progress-linear under the preview on video/audio cards (outside .description). */
const CARD_PROGRESS_HEIGHT = 4

/** Story strip heights by card size (matches item.scss `.story` / `.item__size-*`). */
const TIMELINE_STORY_HEIGHT: Record<number, number> = {
  1: 100,
  2: 140,
  3: 180,
  4: 220,
  5: 260,
  6: 300,
}

/** Rating / favorite row under the timeline storyboard. */
const TIMELINE_META_HEIGHT = 44

/** Compact single-row list view: tight row height for filesystem browser. */
export const LIST_ROW_HEIGHT: Record<number, number> = { 1: 36, 2: 40, 3: 44, 4: 48, 5: 52, 6: 56 }

export const VIRTUAL_GRID_THRESHOLD = 48

/** Extra mounted rows above/below the viewport (smoother fling scroll). */
export const VIRTUAL_ROW_BUFFER = 4

export const VIRTUAL_MASONRY_BUFFER = 600

/** Estimated description block height before natural rows are measured. */
export function getDescriptionHeight(size = 3): number {
  return DESCRIPTION_HEIGHT[Number(size)] || DESCRIPTION_HEIGHT[3]
}

/** Stride for one virtual row: measured value or estimate. */
export function getVariableRowStride(
  rowIndex: number,
  measured: ReadonlyMap<number, number>,
  estimatedStride: number,
): number {
  const known = measured.get(rowIndex)
  if (known != null && known > 0) return known
  return Math.max(1, estimatedStride)
}

/**
 * Pixel offset of the top of `rowIndex` in a variable-height grid.
 * O(measured) — most rows share `estimatedStride`, so we only apply deltas.
 */
export function getVariableRowOffset(
  rowIndex: number,
  measured: ReadonlyMap<number, number>,
  estimatedStride: number,
): number {
  const end = Math.max(0, rowIndex)
  const estimated = Math.max(1, estimatedStride)
  if (!measured.size) return end * estimated

  let offset = end * estimated
  for (const [index, stride] of measured) {
    if (index >= 0 && index < end && stride > 0) {
      offset += stride - estimated
    }
  }
  return offset
}

/** Total scroll height for `totalRows` with mixed measured/estimated strides. */
export function getVariableGridHeight(
  totalRows: number,
  measured: ReadonlyMap<number, number>,
  estimatedStride: number,
): number {
  return getVariableRowOffset(Math.max(0, totalRows), measured, estimatedStride)
}

/** Row index that contains `offsetY` (clamped to last row). */
export function findVariableRowAtOffset(
  offsetY: number,
  totalRows: number,
  measured: ReadonlyMap<number, number>,
  estimatedStride: number,
): number {
  if (totalRows <= 0) return 0
  const target = Math.max(0, offsetY)
  const estimated = Math.max(1, estimatedStride)

  if (!measured.size) {
    return Math.min(totalRows - 1, Math.floor(target / estimated))
  }

  let lo = 0
  let hi = totalRows - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    const midBottom = getVariableRowOffset(mid, measured, estimated)
      + getVariableRowStride(mid, measured, estimated)
    if (midBottom <= target) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** Average measured stride for jump/seek; falls back to estimate. */
export function averageMeasuredRowStride(
  measured: ReadonlyMap<number, number>,
  estimatedStride: number,
): number {
  if (!measured.size) return Math.max(1, estimatedStride)
  let sum = 0
  for (const stride of measured.values()) sum += stride
  return Math.max(1, Math.round(sum / measured.size))
}

export function getGridGap(gapSize = 'xs'): { x: number; y: number } {
  return GAP_SIZE[gapSize] || GAP_SIZE.xs
}

export interface GridLayoutOptions {
  size?: number
  lineGrid?: boolean
  listGrid?: boolean
  chipsGrid?: boolean
  imageGrid?: boolean
  wideImage?: boolean
  /** Minimalism: thumb + filename only (no description / progress). */
  imageOnly?: boolean
  containerWidth?: number
  gapSize?: string
  columnCount?: number
  imageAspectRatio?: number
}

export function getTargetCardWidth(options: GridLayoutOptions = {}): number {
  const size = Number(options.size) || 3

  if (options.lineGrid || options.listGrid) return options.containerWidth || 1200

  if (options.chipsGrid) {
    return CHIP_WIDTH[size] || CHIP_WIDTH[3]
  }

  if (options.imageGrid) {
    return CARD_WIDTH.image[size] || CARD_WIDTH.image[3]
  }

  if (options.wideImage) {
    return CARD_WIDTH.wide[size] || CARD_WIDTH.wide[3]
  }

  return CARD_WIDTH.default[size] || CARD_WIDTH.default[3]
}

export interface LayoutMetrics {
  columnCount: number
  cardWidth: number
}

function getColumnCountFromTarget(
  containerWidth: number,
  targetWidth: number,
  gapX: number,
): number {
  if (!containerWidth || !targetWidth) return 1

  return Math.max(1, Math.floor((containerWidth + gapX) / (targetWidth + gapX)))
}

export function getLayoutMetrics(
  containerWidth: number,
  options: GridLayoutOptions = {},
): LayoutMetrics {
  if (options.lineGrid || options.listGrid) {
    return {
      columnCount: 1,
      cardWidth: containerWidth || getTargetCardWidth(options),
    }
  }

  if (options.chipsGrid) {
    const target = getTargetCardWidth(options)
    const gapX = getGridGap(options.gapSize).x
    return {
      columnCount: getColumnCountFromTarget(containerWidth, target, gapX),
      cardWidth: target,
    }
  }

  const gap = getGridGap(options.gapSize)
  const target = getTargetCardWidth(options)
  let columnCount = getColumnCountFromTarget(containerWidth, target, gap.x)

  const size = Number(options.size) || 3
  if (size > 1) {
    const prevMetrics = getLayoutMetrics(containerWidth, { ...options, size: size - 1 })
    if (columnCount >= prevMetrics.columnCount) {
      columnCount = Math.max(1, prevMetrics.columnCount - 1)
    }
  }

  const cardWidth = containerWidth && columnCount > 0
    ? (containerWidth - gap.x * (columnCount - 1)) / columnCount
    : target

  return { columnCount, cardWidth }
}

export function getColumnCount(
  containerWidth: number,
  cardWidth: number,
  gapX: number,
  options: GridLayoutOptions = {},
): number {
  if (options.lineGrid || options.listGrid) return 1

  return getLayoutMetrics(containerWidth, {
    ...options,
    containerWidth,
  }).columnCount
}

/** Card width that fills the row while column count follows the target size. */
export function getDistributedCardWidth(
  containerWidth: number,
  options: GridLayoutOptions = {},
): number {
  if (options.lineGrid || options.listGrid || options.chipsGrid) {
    return getTargetCardWidth(options)
  }

  return getLayoutMetrics(containerWidth, options).cardWidth
}

export function getGridLayoutStyle(options: GridLayoutOptions = {}): Record<string, string> {
  const gap = getGridGap(options.gapSize)
  const size = Number(options.size) || 3
  const descriptionHeight = options.imageOnly
    ? MINIMAL_FILENAME_HEIGHT
    : getDescriptionHeight(size)
  const style: Record<string, string> = {
    '--grid-gap-x': `${gap.x}px`,
    '--grid-gap-y': `${gap.y}px`,
    '--card-description-height': `${descriptionHeight}px`,
  }

  if (!options.chipsGrid) {
    let cardWidth: number
    if (options.lineGrid || options.listGrid) {
      cardWidth = options.containerWidth || getTargetCardWidth(options)
    } else if (options.containerWidth) {
      cardWidth = getDistributedCardWidth(options.containerWidth, options)
    } else {
      cardWidth = getTargetCardWidth(options)
    }
    style['--card-width'] = `${cardWidth}px`
  }

  return style
}

export interface GridRow<T> {
  index: number
  startIndex: number
  items: T[]
}

export interface MasonryItemPosition<T> {
  item: T
  index: number
  column: number
  top: number
  height: number
}

export interface MasonryLayout<T> {
  positions: MasonryItemPosition<T>[]
  columnCount: number
  columnWidth: number
  gapX: number
  gapY: number
  totalHeight: number
}

export function getMasonryColumnLeft(
  column: number,
  colWidth: number,
  gapX: number,
): number {
  return column * (colWidth + gapX)
}

export function buildMasonryLayout<T>(
  items: T[],
  columnCount: number,
  colWidth: number,
  gapX: number,
  gapY: number,
  getItemHeight: (item: T, colWidth: number) => number,
): MasonryLayout<T> {
  const cols = Math.max(1, columnCount)
  const positions: MasonryItemPosition<T>[] = []
  const colHeights = new Array<number>(cols).fill(0)

  items.forEach((item, index) => {
    const height = getItemHeight(item, colWidth)
    let shortest = 0

    for (let col = 1; col < cols; col += 1) {
      if (colHeights[col] < colHeights[shortest]) {
        shortest = col
      }
    }

    const top = colHeights[shortest]
    positions.push({ item, index, column: shortest, top, height })
    colHeights[shortest] = top + height + gapY
  })

  const tallestColumn = colHeights.length ? Math.max(...colHeights) : 0
  const totalHeight = positions.length ? Math.max(0, tallestColumn - gapY) : 0

  return {
    positions,
    columnCount: cols,
    columnWidth: colWidth,
    gapX,
    gapY,
    totalHeight,
  }
}

export function findVisibleMasonryItems<T>(
  positions: MasonryItemPosition<T>[],
  visibleStart: number,
  visibleEnd: number,
  buffer = VIRTUAL_MASONRY_BUFFER,
): MasonryItemPosition<T>[] {
  const start = visibleStart - buffer
  const end = visibleEnd + buffer

  return positions.filter((pos) => pos.top + pos.height > start && pos.top < end)
}

export function getMediaAspectRatio(
  media: { width?: number | null; height?: number | null },
  fallback = 1,
): number {
  const width = Number(media?.width) || 0
  const height = Number(media?.height) || 0

  if (width > 0 && height > 0) {
    return width / height
  }

  return fallback
}

export function estimateMasonryItemHeight(
  media: { width?: number | null; height?: number | null },
  colWidth: number,
): number {
  const aspect = getMediaAspectRatio(media)
  return colWidth / aspect
}

export function estimateSquareItemHeight(
  _media: { width?: number | null; height?: number | null },
  colWidth: number,
): number {
  return colWidth
}

export interface MasonryPlacement<T> {
  item: T
  index: number
}

export interface MasonryColumn<T> {
  items: MasonryPlacement<T>[]
}

export function packMasonryColumns<T>(
  items: T[],
  columnCount: number,
  getItemHeight: (item: T, colWidth: number) => number,
  colWidth: number,
  gapY = 0,
): MasonryColumn<T>[] {
  const layout = buildMasonryLayout(
    items,
    columnCount,
    colWidth,
    0,
    gapY,
    getItemHeight,
  )
  const cols = Math.max(1, columnCount)
  const columns: MasonryColumn<T>[] = Array.from({ length: cols }, () => ({ items: [] }))

  layout.positions.forEach((position) => {
    columns[position.column].items.push({
      item: position.item,
      index: position.index,
    })
  })

  return columns
}

export function chunkIntoRows<T>(items: T[], columnCount: number): GridRow<T>[] {
  const rows: GridRow<T>[] = []
  const cols = Math.max(1, columnCount)

  for (let startIndex = 0; startIndex < items.length; startIndex += cols) {
    rows.push({
      index: rows.length,
      startIndex,
      items: items.slice(startIndex, startIndex + cols),
    })
  }

  return rows
}

export function estimateRowHeight(options: GridLayoutOptions = {}): number {
  const size = Number(options.size) || 3
  const gap = getGridGap(options.gapSize)

  if (options.lineGrid) {
    const story = TIMELINE_STORY_HEIGHT[size] || TIMELINE_STORY_HEIGHT[3]
    // Initial/phantom estimate; visible timeline rows measure natural height.
    // Keep story tall enough so first paint does not squash 3×3 sprites.
    return story + TIMELINE_META_HEIGHT + CARD_PROGRESS_HEIGHT + gap.y
  }

  if (options.listGrid) {
    // Rows are divided by a 1px border, not the (much larger) grid gap —
    // that's what keeps the list compact regardless of the gap-size setting.
    return LIST_ROW_HEIGHT[size] || LIST_ROW_HEIGHT[3]
  }

  if (options.chipsGrid) {
    const height = CHIP_ROW_HEIGHT[size] || CHIP_ROW_HEIGHT[3]
    return height + gap.y
  }

  const cardWidth = options.containerWidth
    ? getDistributedCardWidth(options.containerWidth, options)
    : getTargetCardWidth(options)
  const aspect = options.imageAspectRatio && options.imageAspectRatio > 0
    ? options.imageAspectRatio
    : 16 / 9
  if (options.imageOnly) {
    return cardWidth / aspect + MINIMAL_FILENAME_HEIGHT + gap.y
  }
  const description = DESCRIPTION_HEIGHT[size] || DESCRIPTION_HEIGHT[3]
  // Progress sits outside the clamped description; omit for image media grids.
  const progress = options.imageGrid ? 0 : CARD_PROGRESS_HEIGHT

  return cardWidth / aspect + description + progress + gap.y
}

export function shouldUseVirtualGrid(
  itemCount: number,
  isInfiniteScroll: boolean,
  itemsType: 'media' | 'tag' = 'media',
  {enabled = true}: {enabled?: boolean} = {},
): boolean {
  if (!enabled) return false
  // Tags/chips and small pages stay fully rendered (content-visibility is enough).
  if (itemsType !== 'media') return false
  // Infinite scroll: virtualize from the first page (no plain→virtual remount mid-scroll).
  if (isInfiniteScroll) return itemCount > 0
  return itemCount >= VIRTUAL_GRID_THRESHOLD
}

export function shouldUseVirtualMasonry(
  itemCount: number,
  _isInfiniteScroll: boolean,
  itemsType: 'media' | 'tag' = 'media',
  {
    enabled = true,
    items = [],
    minDimensionCoverage = 0.95,
  }: {
    enabled?: boolean
    items?: Array<{ width?: number | null; height?: number | null }>
    minDimensionCoverage?: number
  } = {},
): boolean {
  if (!enabled) return false
  if (itemsType !== 'media') return false
  // Masonry keeps its own gate so huge image infinite galleries can virtualize
  // without inheriting the card-grid infinite-scroll disable above.
  if (itemCount < VIRTUAL_GRID_THRESHOLD) return false
  if (!items.length) return false

  let withDims = 0
  for (const item of items) {
    if (Number(item.width) > 0 && Number(item.height) > 0) withDims += 1
  }

  return withDims / items.length >= minDimensionCoverage
}

export function getLayoutTopInScroll(
  layoutEl: Element | null | undefined,
  scrollEl: Element | null | undefined,
): number {
  if (!layoutEl || !scrollEl) return 0

  const layoutRect = layoutEl.getBoundingClientRect()
  const scrollRect = scrollEl.getBoundingClientRect()

  return layoutRect.top - scrollRect.top + (scrollEl as HTMLElement).scrollTop
}
