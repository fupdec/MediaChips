export const INFINITE_SCROLL_FLAG_LIMIT = 101
export const INFINITE_SCROLL_PAGE_SIZE = 25
export const INFINITE_SCROLL_MAX_ITEMS = 200

/** Trimming drops items from the top and breaks scroll position — keep off. */
export const INFINITE_SCROLL_TRIM_ENABLED = false

export function resolvePageLimit(limit: number | null | undefined): number | null {
  if (limit == null || limit <= 0) return null
  if (limit >= INFINITE_SCROLL_FLAG_LIMIT) return INFINITE_SCROLL_PAGE_SIZE
  return limit
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

export function trimInfiniteScrollItems<T>(
  items: T[],
  maxItems: number = INFINITE_SCROLL_MAX_ITEMS,
): T[] {
  if (!INFINITE_SCROLL_TRIM_ENABLED || items.length <= maxItems) return items
  return items.slice(items.length - maxItems)
}
