export const INFINITE_SCROLL_FLAG_LIMIT = 101
/** Items per infinite-scroll fetch — larger pages = fewer round-trips while scrolling. */
export const INFINITE_SCROLL_PAGE_SIZE = 40
/** Max items retained in the client infinite-scroll data window. */
export const INFINITE_SCROLL_MAX_ITEMS = 160

export const INFINITE_SCROLL_TRIM_ENABLED = true

export function resolvePageLimit(limit: number | null | undefined): number | null {
  if (limit == null || limit <= 0) return null
  // Only the settings sentinel (101) maps to the infinite page size.
  // Explicit larger limits (e.g. jump windows) must pass through unchanged.
  if (limit === INFINITE_SCROLL_FLAG_LIMIT) return INFINITE_SCROLL_PAGE_SIZE
  return limit
}

/**
 * Absolute start index for a scrollbar jump window.
 * Upward seeks bias the seek toward the bottom of the window so the user has
 * room to keep scrolling up without immediately re-jumping.
 * Aligned to `align` (default = windowSize) so one LIMIT/OFFSET fetch is exact.
 */
export function getInfiniteJumpWindowStart(input: {
  seekIndex: number
  totalCount: number
  currentWindowStart?: number
  windowSize?: number
  /** Alignment step for OFFSET; defaults to windowSize (single fat fetch). */
  pageSize?: number
}): number {
  const windowSize = Math.max(
    1,
    Math.floor(Number(input.windowSize) || INFINITE_SCROLL_MAX_ITEMS),
  )
  const align = Math.max(
    1,
    Math.floor(Number(input.pageSize) || windowSize),
  )
  const total = Math.max(0, Math.floor(Number(input.totalCount) || 0))
  if (total <= windowSize) return 0

  const seek = Math.min(Math.max(0, Math.floor(Number(input.seekIndex) || 0)), total - 1)
  const currentStart = Math.max(0, Math.floor(Number(input.currentWindowStart) || 0))
  const bias = seek < currentStart ? 0.75 : 0.25
  const maxStart = Math.max(0, total - windowSize)
  let start = Math.min(Math.max(0, seek - Math.floor(windowSize * bias)), maxStart)
  start = Math.floor(start / align) * align
  if (seek >= start + windowSize) {
    start = Math.min(Math.floor(seek / align) * align, maxStart)
  }
  if (seek < start) {
    start = Math.max(0, Math.floor(seek / align) * align)
  }
  return Math.max(0, Math.min(start, maxStart))
}

export function shouldPaginateMediaList(options: {
  ids?: unknown[] | null
  limit?: number | null
} = {}) {
  const ids = options.ids ?? []
  const pageLimit = resolvePageLimit(options.limit ?? null)
  return !ids.length && pageLimit != null
}

export function slicePage<T>(items: T[], page: number, limit: number | null | undefined): T[] {
  const pageLimit = resolvePageLimit(limit)
  if (!pageLimit) return items

  const safePage = Math.max(1, Number(page) || 1)
  const offset = (safePage - 1) * pageLimit
  return items.slice(offset, offset + pageLimit)
}

/** Reorder fetched rows to match an id list; drop missing ids. */
export function orderRowsByIds<T extends {id?: unknown}>(
  rows: T[],
  ids: Array<number | string>,
): T[] {
  const rowsById = new Map(rows.map((row) => [Number(row.id), row]))
  return ids
    .map((id) => rowsById.get(Number(id)))
    .filter((row): row is T => row != null)
}

export function trimInfiniteScrollItems<T>(
  items: T[],
  maxItems: number = INFINITE_SCROLL_MAX_ITEMS,
): { items: T[]; trimmedFromTop: number } {
  if (!INFINITE_SCROLL_TRIM_ENABLED || items.length <= maxItems) {
    return { items, trimmedFromTop: 0 }
  }

  const trimmedFromTop = items.length - maxItems
  return {
    items: items.slice(trimmedFromTop),
    trimmedFromTop,
  }
}
