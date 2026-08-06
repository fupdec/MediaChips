import type {FilterLike} from '../types/db'
import type {ItemsGroupSummary} from '../../shared/itemsGroupBy'
import {buildFilteredTotalsCacheKey} from './mediaListTotalsCache'

const GROUPING_CACHE_TTL_MS = 30_000
const MAX_GROUPING_ENTRIES = 80

export type MediaListGroupingCacheValue = {
  groups: ItemsGroupSummary[]
  orderedIds: number[]
}

interface TimedValue<T> {
  expiresAt: number
  value: T
}

const groupingCache = new Map<string, TimedValue<MediaListGroupingCacheValue>>()

function isFresh<T>(entry: TimedValue<T> | undefined): entry is TimedValue<T> {
  return Boolean(entry && entry.expiresAt > Date.now())
}

function pruneGroupingCache(): void {
  if (groupingCache.size <= MAX_GROUPING_ENTRIES) return
  const oldestKey = groupingCache.keys().next().value
  if (oldestKey !== undefined) groupingCache.delete(oldestKey)
}

export function buildMediaListGroupingCacheKey(options: {
  mediaTypeId?: number | string | null
  filters?: FilterLike[]
  find_duplicates?: boolean
  duplicates_by?: string
  groupBy: string
  sortBy?: string
  direction?: string
  groupMetaId?: number | null
  groupByMetaType?: string | null
}): string {
  return JSON.stringify({
    totals: buildFilteredTotalsCacheKey({
      mediaTypeId: options.mediaTypeId,
      filters: options.filters,
      find_duplicates: options.find_duplicates,
      duplicates_by: options.duplicates_by,
    }),
    groupBy: options.groupBy,
    sortBy: options.sortBy || 'id',
    direction: options.direction || 'desc',
    groupMetaId: options.groupMetaId ?? null,
    groupByMetaType: options.groupByMetaType ?? null,
  })
}

export function getCachedMediaListGrouping(
  cacheKey: string,
): MediaListGroupingCacheValue | null {
  const entry = groupingCache.get(cacheKey)
  if (!isFresh(entry)) {
    if (entry) groupingCache.delete(cacheKey)
    return null
  }
  return entry.value
}

export function setCachedMediaListGrouping(
  cacheKey: string,
  value: MediaListGroupingCacheValue,
): void {
  groupingCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + GROUPING_CACHE_TTL_MS,
  })
  pruneGroupingCache()
}

export function clearMediaListGroupingCache(): void {
  groupingCache.clear()
}
