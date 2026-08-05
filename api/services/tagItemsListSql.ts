import type { ItemsGroupSummary } from '../../shared/itemsGroupBy'
import { buildTagIdSelect, getTagFromClause } from './tagFilterSql'

export type TagListSqlPartsInput = {
  whereSql: string
  joinSql?: string
  needsDistinct?: boolean
  direction?: string
}

export type TagListSqlParts = {
  whereClause: string
  fromClause: string
  idSelect: string
  sortDir: 'ASC' | 'DESC'
}

/** Shared FROM / WHERE / id-select pieces for tag list SQL. */
export function resolveTagListSqlParts(input: TagListSqlPartsInput): TagListSqlParts {
  const {
    whereSql,
    joinSql = '',
    needsDistinct = false,
    direction = 'desc',
  } = input

  return {
    whereClause: `WHERE ${whereSql}`,
    fromClause: getTagFromClause(joinSql),
    idSelect: buildTagIdSelect(needsDistinct),
    sortDir: direction === 'asc' ? 'ASC' : 'DESC',
  }
}

export function assembleTagListResult(args: {
  items: unknown[]
  totalUnfiltered: number | null
  totalFiltered: number | null
  groups?: ItemsGroupSummary[]
  shouldPaginate: boolean
  safePage: number
  pageLimit: number | null
  skipTotals?: boolean
}): Record<string, unknown> {
  const {
    items,
    totalUnfiltered,
    totalFiltered,
    groups,
    shouldPaginate,
    safePage,
    pageLimit,
    skipTotals = false,
  } = args

  const result: Record<string, unknown> = {
    items,
    total: totalUnfiltered,
    totalFiltered,
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
