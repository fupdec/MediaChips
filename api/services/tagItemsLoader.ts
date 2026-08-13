import type { ApiDb, FilterLike } from '../types/db'
import type { DbItemRow } from '../../app/types/items'
import { parseItemsFromDb } from './filterItems'
import { runFilterItemsAsync } from './filterItemsWorkerRunner'
import { enterLegacyListLoader } from './legacyListLoaderGate'
import { createTagsRepository } from '../db/repositories/tags'
import { createMetaRepository } from '../db/repositories/meta'
import { queryAllAsync } from '../db/utils/rawQuery'
import { chunkArray } from '../db/utils/chunk'
import {
  getTagFilterSqlFallbackReason,
  getTagSortPlan,
  resolveTagFilterQuery,
} from './tagFilterSql'
import {buildFilteredCountSql} from './filteredListSql'
import {
  resolvePageLimit,
  shouldPaginateMediaList,
  slicePage,
  orderRowsByIds,
} from './mediaItemsPagination'
import {
  appendIdQueryLimitOffset,
  shouldComputeListTotals,
} from './mediaItemsListSql'
import {assembleTagListResult, resolveTagListSqlParts} from './tagItemsListSql'
import { resolveSortMetaType } from './resolveSortMetaType'
import {
  matchesTagAutocomplete,
  type TagAutocompleteSearchMode,
} from '../../shared/tagAutocompleteMatch'
import {
  aggregateGroupedItems,
  resolveListGroupBy,
  type BuildItemGroupsOptions,
  type GroupableItem,
  type ItemsGroupSummary,
} from '../../shared/itemsGroupBy'

export interface TagLoadOptions {
  metaId: number
  ids?: number[]
  filters?: FilterLike[]
  /** How active filter rows combine: all (AND, default) or any (OR). */
  filtersJoin?: 'and' | 'or'
  sortBy?: string
  direction?: string
  find_duplicates?: boolean
  page?: number
  limit?: number | null
  skipTotals?: boolean
  /** Server-side autocomplete / name+synonym search within a meta category. */
  search?: string
  /** Typing-filter mode: substring (=exact) or chars with gaps (default). */
  searchMode?: TagAutocompleteSearchMode
  groupBy?: string
  groupByMetaType?: string | null
}

const TAG_GROUP_SLIM_SELECT = `SELECT
  tags.id,
  tags.name,
  tags.rating,
  tags.favorite,
  tags.views,
  tags.viewedAt,
  tags.createdAt,
  tags.updatedAt,
  tags.metaId`

async function attachTagPinnedMetaForGrouping(
  db: ApiDb,
  items: GroupableItem[],
  metaId: number,
  metaType: string | null | undefined,
): Promise<BuildItemGroupsOptions> {
  const tagIds = items
    .map((item) => Number(item.id))
    .filter((id) => Number.isFinite(id))
  if (!tagIds.length) {
    return {metaId, metaType: metaType || null}
  }

  const type = String(metaType || '')
  const isTagMeta = !type || type === 'array' || type === 'select'
  const tagsByParentId = new Map<number, Array<{tagId: number; metaId: number}>>()
  const valuesByParentId = new Map<number, Array<{metaId: number; value: unknown}>>()
  const tagNameById = new Map<number, string>()

  for (const chunk of chunkArray(tagIds)) {
    if (isTagMeta) {
      const tagRows = await queryAllAsync(db,
        `SELECT parentTagId, tagId, metaId FROM tagsInTags
         WHERE parentTagId IN (:tagIds) AND metaId = :metaId`,
        {tagIds: chunk, metaId},
      )
      for (const row of tagRows) {
        const parentId = Number(row.parentTagId)
        const linkedId = Number(row.tagId)
        if (!Number.isFinite(parentId) || !Number.isFinite(linkedId)) continue
        if (!tagsByParentId.has(parentId)) tagsByParentId.set(parentId, [])
        tagsByParentId.get(parentId)!.push({tagId: linkedId, metaId: Number(row.metaId)})
      }
    } else {
      const valueRows = await queryAllAsync(db,
        `SELECT tagId, value, metaId FROM valuesInTags
         WHERE tagId IN (:tagIds) AND metaId = :metaId`,
        {tagIds: chunk, metaId},
      )
      for (const row of valueRows) {
        const parentId = Number(row.tagId)
        if (!Number.isFinite(parentId)) continue
        if (!valuesByParentId.has(parentId)) valuesByParentId.set(parentId, [])
        valuesByParentId.get(parentId)!.push({
          metaId: Number(row.metaId),
          value: row.value,
        })
      }
    }
  }

  if (isTagMeta && tagsByParentId.size) {
    const linkedIds = [...new Set(
      [...tagsByParentId.values()].flatMap((rows) => rows.map((row) => row.tagId)),
    )]
    for (const chunk of chunkArray(linkedIds)) {
      const nameRows = await queryAllAsync(db,
        `SELECT id, name FROM tags WHERE id IN (:ids)`,
        {ids: chunk},
      )
      for (const row of nameRows) {
        tagNameById.set(Number(row.id), String(row.name || ''))
      }
    }
  }

  for (const item of items) {
    const id = Number(item.id)
    item.tags = tagsByParentId.get(id) || []
    item.values = valuesByParentId.get(id) || []
  }

  return {
    metaId,
    metaType: metaType || (isTagMeta ? 'array' : 'string'),
    resolveTagName: (tagId) => tagNameById.get(Number(tagId)) || `#${tagId}`,
  }
}

async function buildTagGroupsFromSlimRows(
  db: ApiDb,
  slimRows: Array<Record<string, unknown>>,
  groupBy: ReturnType<typeof resolveListGroupBy>['groupBy'],
  sortBy: unknown,
  groupMetaId: number | null,
  groupByMetaType?: string | null,
  direction?: string | null,
): Promise<{groups: ItemsGroupSummary[]; orderedIds: number[]}> {
  const items = slimRows.map((row) => ({...row})) as GroupableItem[]
  let options: BuildItemGroupsOptions = {
    metaId: groupMetaId,
    metaType: groupByMetaType || null,
    direction: direction || 'asc',
  }

  if (groupBy === 'pinnedMeta' && groupMetaId != null) {
    let metaType = groupByMetaType || null
    if (!metaType) {
      const metaRepo = createMetaRepository(db.drizzle)
      metaType = metaRepo.findById(groupMetaId)?.type || 'array'
    }
    options = {
      ...(await attachTagPinnedMetaForGrouping(db, items, groupMetaId, metaType)),
      direction: direction || 'asc',
    }
  }

  return aggregateGroupedItems(items, groupBy, sortBy, options)
}

const SEARCH_ID_RESOLVE_LIMIT = 500

function emptyTagItemsResult(options: TagLoadOptions, totalUnfiltered: number | null = null) {
  const pageLimit = resolvePageLimit(options.limit ?? null)
  const shouldPaginate = shouldPaginateMediaList({ids: options.ids, limit: options.limit ?? null})
  const safePage = Math.max(1, Number(options.page) || 1)

  return assembleTagListResult({
    items: [],
    totalUnfiltered,
    totalFiltered: 0,
    shouldPaginate,
    safePage,
    pageLimit,
    skipTotals: options.skipTotals,
  })
}

async function resolveSearchTagIds(
  db: ApiDb,
  metaId: number,
  search: string,
  searchMode: TagAutocompleteSearchMode = 'chars',
): Promise<number[]> {
  // Autocomplete uses typing-filter semantics (mid-string + synonyms + optional char gaps),
  // not global-search prefix matching.
  const rows = await queryAllAsync<{
    id: number
    name: string | null
    synonyms: string | null
  }>(db, `SELECT id, name, synonyms
     FROM tags
     WHERE metaId = :metaId`, {metaId})

  const matched: number[] = []
  for (const row of rows) {
    if (!matchesTagAutocomplete(row, search, searchMode)) continue
    matched.push(Number(row.id))
    if (matched.length >= SEARCH_ID_RESOLVE_LIMIT) break
  }
  return matched
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

  const filterQuery = resolveTagFilterQuery({metaId, ids, filters, filtersJoin: options.filtersJoin})
  if (!filterQuery.ok) {
    return loadTagItemsLegacy(db, options, filterQuery.reason)
  }

  const {whereSql, joinSql = '', needsDistinct = false, replacements} = filterQuery
  const sortMetaType = resolveSortMetaType(db, sortBy)
  const sortPlan = getTagSortPlan(sortBy, sortMetaType)
  const sortExpr = sortPlan.expression
  const {
    whereClause,
    fromClause,
    idSelect,
    sortDir,
  } = resolveTagListSqlParts({
    whereSql,
    joinSql,
    sortJoinSql: sortPlan.joinSql,
    needsDistinct,
    direction,
  })

  const pageLimit = resolvePageLimit(limit)
  const shouldPaginate = shouldPaginateMediaList({ids, limit})
  const safePage = Math.max(1, Number(page) || 1)
  const queryReplacements = {...replacements}

  const {groupBy, metaId: groupMetaId} = resolveListGroupBy(options.groupBy, 'tag')
  const groupingActive = groupBy !== 'none'

  let pageIds: number[] = []
  let groups: ItemsGroupSummary[] | undefined

  if (groupingActive) {
    let slimRows: Array<Record<string, unknown>>
    if (needsDistinct) {
      const allIdRows = await queryAllAsync<{id: number}>(db, `${idSelect}
        ${fromClause}
        ${whereClause}
        ORDER BY ${sortExpr} ${sortDir}`, replacements)
      const allIds = allIdRows.map((row) => Number(row.id))
      const rowsById = new Map<number, Record<string, unknown>>()
      for (const chunk of chunkArray(allIds)) {
        const chunkRows = await queryAllAsync(db,
          `${TAG_GROUP_SLIM_SELECT}
           FROM tags
           WHERE tags.id IN (:ids)`,
          {ids: chunk},
        )
        for (const row of chunkRows) {
          rowsById.set(Number(row.id), row)
        }
      }
      slimRows = allIds
        .map((id) => rowsById.get(id))
        .filter((row): row is Record<string, unknown> => row != null)
    } else {
      slimRows = await queryAllAsync(db, `${TAG_GROUP_SLIM_SELECT}
        ${fromClause}
        ${whereClause}
        ORDER BY ${sortExpr} ${sortDir}`, replacements)
    }
    const aggregated = await buildTagGroupsFromSlimRows(
      db,
      slimRows,
      groupBy,
      sortBy,
      groupMetaId,
      options.groupByMetaType,
      direction,
    )
    groups = aggregated.groups
    pageIds = shouldPaginate
      ? slicePage(aggregated.orderedIds, safePage, limit)
      : aggregated.orderedIds
  } else {
    const idQuery = appendIdQueryLimitOffset(
      `${idSelect}
      ${fromClause}
      ${whereClause}
      ORDER BY ${sortExpr} ${sortDir}`,
      queryReplacements,
      {shouldPaginate, pageLimit, safePage},
    )

    const idRows = await queryAllAsync<{id: number}>(db, idQuery, queryReplacements)
    pageIds = idRows.map((row) => Number(row.id))
  }

  let totalUnfiltered: number | null = null
  let totalFiltered: number | null = null

  // Same as media: id-scoped refreshes must not report list totals.
  if (shouldComputeListTotals({skipTotals, ids})) {
    const [totalsRows, unfilteredRows] = await Promise.all([
      queryAllAsync<{totalFiltered: number}>(db, buildFilteredCountSql(fromClause, whereClause, needsDistinct, 'tags.id'), replacements),
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

  return assembleTagListResult({
    items,
    totalUnfiltered,
    totalFiltered,
    groups,
    shouldPaginate,
    safePage,
    pageLimit,
    skipTotals,
  })
}

/** @deprecated Quarantined JS filter-worker path — prefer SQL; gated by legacyListLoaderGate. */
async function loadTagItemsLegacy(
  db: ApiDb,
  options: TagLoadOptions,
  fallbackReason?: string,
) {
  if (fallbackReason) {
    enterLegacyListLoader(
      'tag',
      fallbackReason,
      `(metaId=${options.metaId ?? 'none'}, sortBy=${options.sortBy ?? 'id'})`,
    )
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
    filtersJoin: options.filtersJoin,
  })

  const totalUnfiltered = itemsAll.length
  const pageLimit = resolvePageLimit(limit)
  const shouldPaginate = shouldPaginateMediaList({ids, limit})
  const safePage = Math.max(1, Number(page) || 1)
  const {groupBy, metaId: groupMetaId} = resolveListGroupBy(options.groupBy, 'tag')

  let pageItems = itemsFiltered
  let groups: ItemsGroupSummary[] | undefined

  if (groupBy !== 'none') {
    const aggregated = await buildTagGroupsFromSlimRows(
      db,
      itemsFiltered as unknown as Array<Record<string, unknown>>,
      groupBy,
      sortBy,
      groupMetaId,
      options.groupByMetaType,
      direction,
    )
    groups = aggregated.groups
    const pageIds = shouldPaginate
      ? slicePage(aggregated.orderedIds, safePage, limit)
      : aggregated.orderedIds
    const byId = new Map(itemsFiltered.map((item) => [Number(item.id), item]))
    pageItems = pageIds
      .map((id) => byId.get(id))
      .filter((item): item is typeof itemsFiltered[number] => item != null)
  } else if (shouldPaginate) {
    pageItems = slicePage(itemsFiltered, page, limit)
  }

  return assembleTagListResult({
    items: pageItems,
    totalUnfiltered,
    totalFiltered,
    groups,
    shouldPaginate,
    safePage,
    pageLimit,
    skipTotals,
  })
}

async function loadTagItems(db: ApiDb, options: TagLoadOptions) {
  const search = String(options.search || '').trim()
  const searchMode: TagAutocompleteSearchMode =
    options.searchMode === 'substring' ? 'substring' : 'chars'
  let resolvedOptions = options

  if (search) {
    const matchedIds = await resolveSearchTagIds(db, options.metaId, search, searchMode)
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
  loadTagItemsSql,
}
