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
export function shouldComputeMediaListTotals(options: {
  skipTotals?: boolean
  ids?: unknown[]
}): boolean {
  return !options.skipTotals && !(options.ids?.length)
}

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
