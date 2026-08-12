import type { FilterLike } from '../types/db'
import { normalizeActiveFilters } from './mediaFilterSql'

const FILTERED_TOTALS_TTL_MS = 30_000
const UNFILTERED_TOTAL_TTL_MS = 60_000
const MAX_FILTERED_ENTRIES = 100

interface TimedValue<T> {
  expiresAt: number
  value: T
}

interface FilteredTotals {
  totalFiltered: number
  totalFilesize: number
}

const filteredTotalsCache = new Map<string, TimedValue<FilteredTotals>>()
const unfilteredTotalsCache = new Map<number, TimedValue<number>>()

function isFresh<T>(entry: TimedValue<T> | undefined): entry is TimedValue<T> {
  return Boolean(entry && entry.expiresAt > Date.now())
}

function pruneFilteredTotalsCache(): void {
  if (filteredTotalsCache.size <= MAX_FILTERED_ENTRIES) return
  const oldestKey = filteredTotalsCache.keys().next().value
  if (oldestKey !== undefined) filteredTotalsCache.delete(oldestKey)
}

export function buildFilteredTotalsCacheKey(options: {
  mediaTypeId?: number | string | null
  filters?: FilterLike[]
  filtersJoin?: 'and' | 'or'
  find_duplicates?: boolean
  duplicates_by?: string
} = {}): string {
  const activeFilters = normalizeActiveFilters(options.filters).map((filter) => ({
    param: filter.param,
    type: filter.type,
    cond: filter.cond,
    val: filter.val,
    active: filter.active,
  }))

  return JSON.stringify({
    mediaTypeId: options.mediaTypeId ?? null,
    find_duplicates: Boolean(options.find_duplicates),
    duplicates_by: options.duplicates_by || 'filesize',
    filtersJoin: options.filtersJoin === 'or' ? 'or' : 'and',
    filters: activeFilters,
  })
}

export function getCachedFilteredTotals(cacheKey: string): FilteredTotals | null {
  const entry = filteredTotalsCache.get(cacheKey)
  if (!isFresh(entry)) {
    if (entry) filteredTotalsCache.delete(cacheKey)
    return null
  }
  return entry.value
}

export function setCachedFilteredTotals(cacheKey: string, value: FilteredTotals): void {
  filteredTotalsCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + FILTERED_TOTALS_TTL_MS,
  })
  pruneFilteredTotalsCache()
}

export function getCachedUnfilteredTotal(mediaTypeId: number | string): number | null {
  const key = Number(mediaTypeId)
  const entry = unfilteredTotalsCache.get(key)
  if (!isFresh(entry)) {
    if (entry) unfilteredTotalsCache.delete(key)
    return null
  }
  return entry.value
}

export function setCachedUnfilteredTotal(mediaTypeId: number | string, total: number): void {
  unfilteredTotalsCache.set(Number(mediaTypeId), {
    value: total,
    expiresAt: Date.now() + UNFILTERED_TOTAL_TTL_MS,
  })
}

export function clearMediaListTotalsCache(): void {
  filteredTotalsCache.clear()
  unfilteredTotalsCache.clear()
}
