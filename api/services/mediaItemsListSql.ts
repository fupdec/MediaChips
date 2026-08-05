import type { AnyRecord, FilterLike } from '../types/db'
import type {
  LoadedMediaItem,
  MediaFilterQuerySuccess,
  NavigationMediaItem,
} from '../types/mediaFilter'
import type { ItemsGroupSummary } from '../../shared/itemsGroupBy'
import {
  getMediaFromClause,
  requiresMetadataJoinForFilters,
  requiresMetadataJoinForSort,
} from './mediaFilterSql'
import { buildMediaIdSelect } from './filteredListSql'
import { slicePage } from './mediaItemsPagination'

/** Pure where-builder for visual near-duplicate lists (DB lookup stays in the loader). */
export function buildVisualNearDuplicateFilterSuccess(
  mediaTypeId: number | string,
  nearIds: number[],
  requestIds: Array<number | string> = [],
): MediaFilterQuerySuccess {
  const scopedIds = requestIds.length
    ? requestIds.map(Number).filter((id) => nearIds.includes(id))
    : nearIds

  const replacements: AnyRecord = {mediaTypeId}
  const clauses = ['media.mediaTypeId = :mediaTypeId']
  if (!scopedIds.length) {
    clauses.push('0 = 1')
  } else {
    replacements.visualNearIds = scopedIds
    clauses.push('media.id IN (:visualNearIds)')
  }

  return {
    ok: true,
    whereSql: clauses.join(' AND '),
    joinSql: '',
    needsDistinct: false,
    replacements,
  }
}

export type MediaListSqlPartsInput = {
  whereSql: string
  joinSql?: string
  needsDistinct?: boolean
  filters?: FilterLike[]
  sortBy?: string
  direction?: string
  /** When true, sort FROM joins metadata even if sort/filters alone would not. */
  includeGroupingJoin?: boolean
}

export type MediaListSqlParts = {
  whereClause: string
  fromForCount: string
  fromForSort: string
  idSelect: string
  sortDir: 'ASC' | 'DESC'
}

/** Shared FROM / WHERE / id-select pieces used by list, count, and id loaders. */
export function resolveMediaListSqlParts(input: MediaListSqlPartsInput): MediaListSqlParts {
  const {
    whereSql,
    joinSql = '',
    needsDistinct = false,
    filters = [],
    sortBy = 'id',
    direction = 'desc',
    includeGroupingJoin = false,
  } = input

  const joinForFilters = requiresMetadataJoinForFilters(filters)
  const joinForSort = requiresMetadataJoinForSort(sortBy)

  return {
    whereClause: `WHERE ${whereSql}`,
    fromForCount: getMediaFromClause(joinForFilters, joinSql),
    fromForSort: getMediaFromClause(
      joinForFilters || joinForSort || includeGroupingJoin,
      joinSql,
    ),
    idSelect: buildMediaIdSelect(needsDistinct),
    sortDir: direction === 'asc' ? 'ASC' : 'DESC',
  }
}

/** Id-scoped refreshes must not compute/cache totals (cache key ignores `ids`). */
export function shouldComputeListTotals(options: {
  skipTotals?: boolean
  ids?: unknown[]
}): boolean {
  return !options.skipTotals && !(options.ids?.length)
}

/** @deprecated Prefer shouldComputeListTotals — shared by media and tag loaders. */
export const shouldComputeMediaListTotals = shouldComputeListTotals

export function appendIdQueryLimitOffset(
  sql: string,
  replacements: AnyRecord,
  options: {
    shouldPaginate: boolean
    pageLimit: number | null
    safePage: number
  },
): string {
  const {shouldPaginate, pageLimit, safePage} = options
  if (!shouldPaginate || pageLimit == null) return sql
  replacements.limit = pageLimit
  replacements.offset = (safePage - 1) * pageLimit
  return `${sql} LIMIT :limit OFFSET :offset`
}

export function assembleMediaListResult(args: {
  items: LoadedMediaItem[]
  totalUnfiltered: number | null
  totalFiltered: number | null
  totalFilesize: number | null
  navigation?: NavigationMediaItem[]
  groups?: ItemsGroupSummary[]
  shouldPaginate: boolean
  safePage: number
  pageLimit: number | null
  skipTotals?: boolean
}): {
  items: LoadedMediaItem[]
  total: number | null
  totalFiltered: number | null
  totalFilesize: number | null
  navigation?: NavigationMediaItem[]
  page: number
  limit: number | null
  pages?: number
  groups?: ItemsGroupSummary[]
} {
  const {
    items,
    totalUnfiltered,
    totalFiltered,
    totalFilesize,
    navigation,
    groups,
    shouldPaginate,
    safePage,
    pageLimit,
    skipTotals = false,
  } = args

  const result: {
    items: LoadedMediaItem[]
    total: number | null
    totalFiltered: number | null
    totalFilesize: number | null
    navigation?: NavigationMediaItem[]
    page: number
    limit: number | null
    pages?: number
    groups?: ItemsGroupSummary[]
  } = {
    items,
    total: totalUnfiltered,
    totalFiltered,
    totalFilesize,
    navigation,
    page: shouldPaginate ? safePage : 1,
    limit: shouldPaginate ? pageLimit : (totalFiltered ?? items.length),
  }

  if (groups) {
    result.groups = groups
  }

  if (!skipTotals && shouldPaginate && totalFiltered != null && pageLimit != null) {
    result.pages = Math.max(1, Math.ceil(totalFiltered / pageLimit))
  }

  return result
}

/** Shape playlist/filter-card summary from a full legacy list result. */
export function buildMediaSummaryFromListResult(
  result: {totalFiltered: number; items: ReadonlyArray<AnyRecord>},
  previewLimit: number,
): {count: number; previewIds: unknown[]} {
  return {
    count: result.totalFiltered,
    previewIds: result.items.slice(0, previewLimit).map((item) => item.id),
  }
}

/** Shape select-all / bulk-edit id payload from a full legacy list result. */
export function buildFilteredIdsFromListResult(result: {
  items: ReadonlyArray<AnyRecord>
  totalFiltered: number
  totalFilesize: number
}): {ids: unknown[]; totalFiltered: number; totalFilesize: number} {
  return {
    ids: result.items.map((item) => item.id),
    totalFiltered: result.totalFiltered,
    totalFilesize: result.totalFilesize,
  }
}

/** Hit the in-memory totals cache when both filtered + unfiltered entries exist. */
export function resolveCachedListTotals(input: {
  cachedFilteredTotals: {totalFiltered: number; totalFilesize: number} | null | undefined
  cachedUnfilteredTotal: number | null | undefined
}): {totalUnfiltered: number; totalFiltered: number; totalFilesize: number} | null {
  if (input.cachedFilteredTotals && input.cachedUnfilteredTotal != null) {
    return {
      totalUnfiltered: input.cachedUnfilteredTotal,
      totalFiltered: input.cachedFilteredTotals.totalFiltered,
      totalFilesize: input.cachedFilteredTotals.totalFilesize,
    }
  }
  return null
}

/** Normalize COUNT / SUM rows from filtered-list totals queries. */
export function parseListTotalsRows(
  totalsRow: AnyRecord | undefined,
  unfilteredRow: AnyRecord | undefined,
): {totalUnfiltered: number; totalFiltered: number; totalFilesize: number} {
  return {
    totalUnfiltered: Number(unfilteredRow?.totalUnfiltered) || 0,
    totalFiltered: Number(totalsRow?.totalFiltered) || 0,
    totalFilesize: Number(totalsRow?.totalFilesize) || 0,
  }
}

/** Page id window after group aggregation (or full ordered id list). */
export function resolveGroupedPageIds(
  orderedIds: Array<number | string>,
  options: {
    shouldPaginate: boolean
    page: number
    limit: number | null
  },
): Array<number | string> {
  return options.shouldPaginate
    ? slicePage(orderedIds, options.page, options.limit)
    : orderedIds
}
