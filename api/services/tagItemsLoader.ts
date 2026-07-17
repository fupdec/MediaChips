import type { ApiDb, FilterLike } from '../types/db'
import type { DbItemRow } from '../../app/types/items'
import { parseItemsFromDb } from '../../app/tasks/items'
import { runFilterItemsAsync } from './filterItemsWorkerRunner'
import { createTagsRepository } from '../db/repositories/tags'
import { queryAllAsync } from '../db/utils/rawQuery'
import {
  buildTagIdSelect,
  getTagFilterSqlFallbackReason,
  getTagFromClause,
  getTagSortExpression,
  resolveTagFilterQuery,
} from './tagFilterSql'
import {
  resolvePageLimit,
  shouldPaginateMediaList,
  slicePage,
} from './mediaItemsPagination'
import { resolveSortMetaType } from './resolveSortMetaType'
import { searchTagsByName } from './globalSearch'

export interface TagLoadOptions {
  metaId: number
  ids?: number[]
  filters?: FilterLike[]
  sortBy?: string
  direction?: string
  find_duplicates?: boolean
  page?: number
  limit?: number | null
  skipTotals?: boolean
  /** Server-side autocomplete / name+synonym search within a meta category. */
  search?: string
}

const SEARCH_ID_RESOLVE_LIMIT = 500

function emptyTagItemsResult(options: TagLoadOptions, totalUnfiltered: number | null = null) {
  const pageLimit = resolvePageLimit(options.limit ?? null)
  const shouldPaginate = shouldPaginateMediaList({ids: options.ids, limit: options.limit ?? null})
  const safePage = Math.max(1, Number(options.page) || 1)

  const result: Record<string, unknown> = {
    items: [],
    total: totalUnfiltered,
    totalFiltered: 0,
    page: shouldPaginate ? safePage : 1,
    limit: shouldPaginate ? pageLimit : 0,
  }

  if (!options.skipTotals && shouldPaginate && pageLimit != null) {
    result.pages = 1
  }

  return result
}

async function resolveSearchTagIds(db: ApiDb, metaId: number, search: string): Promise<number[]> {
  const matched = await searchTagsByName(db, search, {
    limit: SEARCH_ID_RESOLVE_LIMIT,
    metaId,
  })
  return matched.map((tag) => tag.id)
}

function shouldLogLegacyTagLoader() {
  return process.env.NODE_ENV !== 'production'
    || process.env.MEDIA_CHIPS_LOG_LEGACY_TAG_LOADER === '1'
}

function warnLegacyTagLoader(reason: string, options: TagLoadOptions = {} as TagLoadOptions) {
  if (!shouldLogLegacyTagLoader()) return

  console.warn(
    '[tagItemsLoader] Using legacy JS filter path:',
    reason,
    `(metaId=${options.metaId ?? 'none'}, sortBy=${options.sortBy ?? 'id'})`,
  )
}

function buildFilteredCountSql(fromClause: string, whereClause: string, needsDistinct: boolean) {
  if (!needsDistinct) {
    return `SELECT COUNT(*) AS totalFiltered
      ${fromClause}
      ${whereClause}`
  }

  return `SELECT COUNT(*) AS totalFiltered
    FROM (
      SELECT DISTINCT tags.id
      ${fromClause}
      ${whereClause}
    )`
}

function orderRowsByIds(rows: DbItemRow[], ids: number[]): DbItemRow[] {
  const rowsById = new Map(rows.map((row) => [Number(row.id), row]))
  return ids.map((id) => rowsById.get(id)).filter((row): row is DbItemRow => row != null)
}

async function loadTagItemsSql(db: ApiDb, options: TagLoadOptions) {
  const {
    metaId,
    ids = [],
    filters = [],
    sortBy = 'id',
    direction = 'desc',
    page = 1,
    limit = null,
    skipTotals = false,
  } = options

  const filterQuery = resolveTagFilterQuery({metaId, ids, filters})
  if (!filterQuery.ok) {
    return loadTagItemsLegacy(db, options, filterQuery.reason)
  }

  const {whereSql, joinSql = '', needsDistinct = false, replacements} = filterQuery
  const whereClause = `WHERE ${whereSql}`
  const fromClause = getTagFromClause(joinSql)
  const sortMetaType = resolveSortMetaType(db, sortBy)
  const sortExpr = getTagSortExpression(sortBy, sortMetaType)
  const sortDir = direction === 'asc' ? 'ASC' : 'DESC'
  const idSelect = buildTagIdSelect(needsDistinct)

  const pageLimit = resolvePageLimit(limit)
  const shouldPaginate = shouldPaginateMediaList({ids, limit})
  const safePage = Math.max(1, Number(page) || 1)
  const queryReplacements = {...replacements}

  let idQuery = `${idSelect}
    ${fromClause}
    ${whereClause}
    ORDER BY ${sortExpr} ${sortDir}`

  if (shouldPaginate && pageLimit != null) {
    queryReplacements.limit = pageLimit
    queryReplacements.offset = (safePage - 1) * pageLimit
    idQuery += ' LIMIT :limit OFFSET :offset'
  }

  const idRows = await queryAllAsync<{id: number}>(db, idQuery, queryReplacements)
  const pageIds = idRows.map((row) => Number(row.id))

  let totalUnfiltered: number | null = null
  let totalFiltered: number | null = null

  if (!skipTotals) {
    const [totalsRows, unfilteredRows] = await Promise.all([
      queryAllAsync<{totalFiltered: number}>(db, buildFilteredCountSql(fromClause, whereClause, needsDistinct), replacements),
      queryAllAsync<{totalUnfiltered: number}>(db, `SELECT COUNT(*) AS totalUnfiltered
         FROM tags
         WHERE tags.metaId = :metaId`, {metaId}),
    ])
    totalFiltered = Number(totalsRows[0]?.totalFiltered) || 0
    totalUnfiltered = Number(unfilteredRows[0]?.totalUnfiltered) || 0
  }

  const tagsRepo = createTagsRepository(db.drizzle, db.sqlite)
  const rawRows = pageIds.length
    ? tagsRepo.getItemsForMeta(metaId, pageIds) as DbItemRow[]
    : []
  const orderedRows = orderRowsByIds(rawRows, pageIds)
  const items = parseItemsFromDb(orderedRows)

  const result: Record<string, unknown> = {
    items,
    total: totalUnfiltered,
    totalFiltered,
    page: shouldPaginate ? safePage : 1,
    limit: shouldPaginate ? pageLimit : (totalFiltered ?? items.length),
  }

  if (!skipTotals && shouldPaginate && totalFiltered != null && pageLimit != null) {
    result.pages = Math.max(1, Math.ceil(totalFiltered / pageLimit))
  }

  return result
}

async function loadTagItemsLegacy(
  db: ApiDb,
  options: TagLoadOptions,
  fallbackReason?: string,
) {
  if (fallbackReason) {
    warnLegacyTagLoader(fallbackReason, options)
  }

  const tagsRepo = createTagsRepository(db.drizzle, db.sqlite)
  const {
    metaId,
    ids = [],
    filters = [],
    sortBy = 'id',
    direction = 'desc',
    find_duplicates = false,
    page = 1,
    limit = null,
    skipTotals = false,
  } = options

  const data = tagsRepo.getItemsForMeta(metaId, ids)
  const itemsAll = parseItemsFromDb(data as DbItemRow[])
  const sortMetaType = resolveSortMetaType(db, sortBy)
  const { items: itemsFiltered, totalFiltered } = await runFilterItemsAsync({
    filters,
    itemType: 'tags',
    items: itemsAll,
    sortBy,
    direction,
    find_duplicates,
    sortMetaType,
  })

  const totalUnfiltered = itemsAll.length
  const pageLimit = resolvePageLimit(limit)
  const shouldPaginate = shouldPaginateMediaList({ids, limit})
  const safePage = Math.max(1, Number(page) || 1)
  const pageItems = shouldPaginate
    ? slicePage(itemsFiltered, page, limit)
    : itemsFiltered

  const result: Record<string, unknown> = {
    items: pageItems,
    total: totalUnfiltered,
    totalFiltered,
    page: shouldPaginate ? safePage : 1,
    limit: shouldPaginate ? pageLimit : totalFiltered,
  }

  if (!skipTotals && shouldPaginate && pageLimit != null) {
    result.pages = Math.max(1, Math.ceil(totalFiltered / pageLimit))
  }

  return result
}

async function loadTagItems(db: ApiDb, options: TagLoadOptions) {
  const search = String(options.search || '').trim()
  let resolvedOptions = options

  if (search) {
    const matchedIds = await resolveSearchTagIds(db, options.metaId, search)
    if (!matchedIds.length) {
      let totalUnfiltered: number | null = null
      if (!options.skipTotals) {
        const rows = await queryAllAsync<{totalUnfiltered: number}>(db, `SELECT COUNT(*) AS totalUnfiltered
           FROM tags
           WHERE tags.metaId = :metaId`, {metaId: options.metaId})
        totalUnfiltered = Number(rows[0]?.totalUnfiltered) || 0
      }
      return emptyTagItemsResult(options, totalUnfiltered)
    }

    const requestedIds = Array.isArray(options.ids) ? options.ids : []
    const matchedIdSet = new Set(matchedIds)
    const ids = requestedIds.length
      ? requestedIds.filter((id) => matchedIdSet.has(Number(id)))
      : matchedIds

    if (!ids.length) {
      return emptyTagItemsResult(options)
    }

    resolvedOptions = {...options, ids}
  }

  const fallbackReason = getTagFilterSqlFallbackReason({
    metaId: resolvedOptions.metaId,
    ids: resolvedOptions.ids,
    filters: resolvedOptions.filters,
    find_duplicates: resolvedOptions.find_duplicates,
  })

  if (fallbackReason) {
    return loadTagItemsLegacy(db, resolvedOptions, fallbackReason)
  }

  return loadTagItemsSql(db, resolvedOptions)
}

export {
  loadTagItems,
  loadTagItemsLegacy,
  loadTagItemsSql,
}
