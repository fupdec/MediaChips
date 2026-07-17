export const INFINITE_SCROLL_FLAG_LIMIT = 101
export const INFINITE_SCROLL_PAGE_SIZE = 25
export const INFINITE_SCROLL_MAX_ITEMS = 500

export const INFINITE_SCROLL_TRIM_ENABLED = true

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
