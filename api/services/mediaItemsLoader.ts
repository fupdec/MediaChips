import type { ApiDb, AnyRecord } from '../types/db'
import type {
  LoadedMediaItem,
  MediaId,
  MediaLoadOptions,
  NavigationMediaItem,
} from '../types/mediaFilter'
import type { ParsedItem } from '../../app/types/items'
import { queryAllAsync } from '../db/utils/rawQuery'
import { chunkArray } from '../db/utils/chunk'
import {
  buildMediaFilterQuery,
  getMediaFilterSqlFallbackReason,
  getMediaFromClause,
  getNavigationSelect,
  getSortExpression,
  normalizeActiveFilters,
  requiresMetadataJoinForFilters,
  requiresMetadataJoinForSort,
  resolveMediaFilterQuery,
} from './mediaFilterSql'
import type { MediaFilterQueryResult } from '../types/mediaFilter'
import { findVisualNearDuplicateIds } from './visualHashBackfill'
import {
  buildFilteredTotalsCacheKey,
  getCachedFilteredTotals,
  getCachedUnfilteredTotal,
  setCachedFilteredTotals,
  setCachedUnfilteredTotal,
} from './mediaListTotalsCache'

import { runFilterItemsAsync } from './filterItemsWorkerRunner'
import { enterLegacyListLoader } from './legacyListLoaderGate'
import {
  resolvePageLimit,
  shouldPaginateMediaList,
  slicePage,
  orderRowsByIds,
} from './mediaItemsPagination'
import { resolveSortMetaType } from './resolveSortMetaType'
import {
  resolveListGroupBy,
  type ItemsGroupSummary,
} from '../../shared/itemsGroupBy'
import {
  buildFilteredCountSql,
  buildFilteredTotalsSql,
  buildMediaIdSelect,
} from './filteredListSql'
import {
  createItemShell,
  toNavigationItem,
  usesVisualNearDuplicates,
} from './mediaItemsPresentation'
import {
  GROUP_SLIM_SELECT,
  attachMediaRelations,
  buildMediaGroupsFromSlimRows,
  fetchBaseMediaRows,
} from './mediaItemsRelations'

async function resolveVisualNearDuplicateFilterQuery(
  db: ApiDb,
  options: MediaLoadOptions = {},
): Promise<MediaFilterQueryResult> {
  const {
    mediaTypeId,
    ids = [],
    filters = [],
  } = options

  if (mediaTypeId == null || mediaTypeId === '') {
    return {ok: false, reason: 'Missing mediaTypeId'}
  }

  let candidateIds: number[] | undefined
  const activeFilters = normalizeActiveFilters(filters)
  if (activeFilters.length > 0) {
    const scope = buildMediaFilterQuery(filters, {mediaTypeId, ids: []})
    if (!scope.ok) return scope

    const joinForFilters = requiresMetadataJoinForFilters(filters)
    const fromClause = getMediaFromClause(joinForFilters, scope.joinSql)
    const idSelect = buildMediaIdSelect(scope.needsDistinct)
    const rows = await queryAllAsync(db, `${idSelect}
      ${fromClause}
      WHERE ${scope.whereSql}`, scope.replacements)
    candidateIds = rows.map((row: AnyRecord) => Number(row.id)).filter((id) => Number.isFinite(id))
  }

  const nearIds = findVisualNearDuplicateIds(db, mediaTypeId, {candidateIds})
  const scopedIds = ids.length
    ? ids.map(Number).filter((id) => nearIds.includes(id))
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

async function resolveMediaListFilterQuery(
  db: ApiDb,
  options: MediaLoadOptions = {},
): Promise<MediaFilterQueryResult> {
  if (usesVisualNearDuplicates(options)) {
    return resolveVisualNearDuplicateFilterQuery(db, options)
  }

  return resolveMediaFilterQuery({
    mediaTypeId: options.mediaTypeId,
    ids: options.ids || [],
    filters: options.filters || [],
    find_duplicates: options.find_duplicates,
    duplicates_by: options.duplicates_by,
  })
}

/** @deprecated Quarantined JS filter-worker path — prefer SQL; gated by legacyListLoaderGate. */
async function loadMediaItemsLegacy(
  db: ApiDb,
  options: MediaLoadOptions = {},
  fallbackReason?: string,
) {
  if (fallbackReason) {
    const activeFilterCount = normalizeActiveFilters(options.filters).length
    enterLegacyListLoader(
      'media',
      fallbackReason,
      `(mediaTypeId=${options.mediaTypeId ?? 'none'}, activeFilters=${activeFilterCount}, sortBy=${options.sortBy ?? 'id'})`,
    )
  }
  const {
    mediaTypeId,
    ids = [],
    filters = [],
    sortBy = 'id',
    direction = 'desc',
    find_duplicates = false,
    duplicates_by = 'filesize',
    page = 1,
    limit = null,
    includeNavigation = false,
  } = options

  const rows = await fetchBaseMediaRows(db, mediaTypeId, ids)
  const items = rows.map(createItemShell)
  await attachMediaRelations(db, items, mediaTypeId, ids)

  const sortMetaType = resolveSortMetaType(db, sortBy)
  const totalUnfiltered = items.length
  const { items: filtered, totalFiltered, totalFilesize } = await runFilterItemsAsync({
    filters,
    itemType: 'media',
    items: items as ParsedItem[],
    sortBy,
    direction,
    find_duplicates,
    duplicates_by,
    sortMetaType,
  })

  const pageLimit = resolvePageLimit(limit)
  const shouldPaginate = shouldPaginateMediaList({ ids, limit })
  const {groupBy, metaId: groupMetaId} = resolveListGroupBy(options.groupBy, 'media')

  let pageItems = filtered
  let groups: ItemsGroupSummary[] | undefined

  if (groupBy !== 'none') {
    const aggregated = await buildMediaGroupsFromSlimRows(
      db,
      filtered as unknown as AnyRecord[],
      groupBy,
      sortBy,
      groupMetaId,
      options.groupByMetaType,
      direction,
    )
    groups = aggregated.groups
    const pageIds = shouldPaginate
      ? slicePage(aggregated.orderedIds, page, limit)
      : aggregated.orderedIds
    const byId = new Map(filtered.map((item) => [Number(item.id), item]))
    pageItems = pageIds
      .map((id) => byId.get(id))
      .filter((item): item is typeof filtered[number] => item != null)
  } else if (shouldPaginate) {
    pageItems = slicePage(filtered, page, limit)
  }

  return {
    items: pageItems,
    total: totalUnfiltered,
    totalFiltered,
    totalFilesize,
    navigation: includeNavigation ? filtered.map(toNavigationItem) : undefined,
    page: shouldPaginate ? Math.max(1, Number(page) || 1) : 1,
    limit: shouldPaginate ? pageLimit : totalFiltered,
    pages: shouldPaginate && pageLimit
      ? Math.max(1, Math.ceil(totalFiltered / pageLimit))
      : 1,
    ...(groups ? {groups} : {}),
  }
}

async function loadMediaItemsSql(db: ApiDb, options: MediaLoadOptions = {}) {
  const {
    mediaTypeId,
    ids = [],
    filters = [],
    sortBy = 'id',
    direction = 'desc',
    page = 1,
    limit = null,
    includeNavigation = false,
    skipTotals = false,
  } = options

  const filterQuery = await resolveMediaListFilterQuery(db, options)
  if (!filterQuery.ok) {
    return loadMediaItemsLegacy(db, options, filterQuery.reason)
  }

  const {whereSql, joinSql = '', needsDistinct = false, replacements} = filterQuery
  const whereClause = `WHERE ${whereSql}`
  const sortMetaType = resolveSortMetaType(db, sortBy)
  const sortExpr = getSortExpression(sortBy, sortMetaType)
  const sortDir = direction === 'asc' ? 'ASC' : 'DESC'
  const joinForFilters = requiresMetadataJoinForFilters(filters)
  const joinForSort = requiresMetadataJoinForSort(sortBy)
  const {groupBy, metaId: groupMetaId} = resolveListGroupBy(options.groupBy, 'media')
  const groupingActive = groupBy !== 'none'
  // GROUP_SLIM_SELECT always reads video/image metadata columns.
  const fromForCount = getMediaFromClause(joinForFilters, joinSql)
  const fromForSort = getMediaFromClause(
    joinForFilters || joinForSort || groupingActive,
    joinSql,
  )
  const idSelect = buildMediaIdSelect(needsDistinct)

  const pageLimit = resolvePageLimit(limit)
  const shouldPaginate = shouldPaginateMediaList({ ids, limit })
  const safePage = Math.max(1, Number(page) || 1)
  const queryReplacements = {...replacements}

  let pageIds: MediaId[] = []
  let groups: ItemsGroupSummary[] | undefined

  if (groupingActive) {
    let slimRows: AnyRecord[]
    if (needsDistinct) {
      const allIdRows = await queryAllAsync(db, `${idSelect}
        ${fromForSort}
        ${whereClause}
        ORDER BY ${sortExpr} ${sortDir}`, replacements)
      const allIds = allIdRows.map((row: AnyRecord) => row.id as MediaId)
      const rowsById = new Map<MediaId, AnyRecord>()
      for (const chunk of chunkArray(allIds)) {
        const chunkRows = await queryAllAsync(db,
          `${GROUP_SLIM_SELECT}
           FROM media
           LEFT JOIN videoMetadata ON media.id = videoMetadata.mediaId
           LEFT JOIN imageMetadata ON media.id = imageMetadata.mediaId
           WHERE media.id IN (:ids)`,
          {ids: chunk},
        )
        for (const row of chunkRows) {
          rowsById.set(row.id as MediaId, row)
        }
      }
      slimRows = allIds
        .map((id) => rowsById.get(id))
        .filter((row): row is AnyRecord => row != null)
    } else {
      slimRows = await queryAllAsync(db, `${GROUP_SLIM_SELECT}
        ${fromForSort}
        ${whereClause}
        ORDER BY ${sortExpr} ${sortDir}`, replacements)
    }
    const aggregated = await buildMediaGroupsFromSlimRows(
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
    let idQuery = `${idSelect}
      ${fromForSort}
      ${whereClause}
      ORDER BY ${sortExpr} ${sortDir}`

    if (shouldPaginate && pageLimit != null) {
      queryReplacements.limit = pageLimit
      queryReplacements.offset = (safePage - 1) * pageLimit
      idQuery += ' LIMIT :limit OFFSET :offset'
    }

    const idRows = await queryAllAsync(db, idQuery, queryReplacements)
    pageIds = idRows.map((row: AnyRecord) => row.id as MediaId)
  }

  const totalsCacheKey = buildFilteredTotalsCacheKey({
    mediaTypeId,
    filters,
    find_duplicates: options.find_duplicates,
    duplicates_by: options.duplicates_by,
  })

  let totalUnfiltered: number | null = null
  let totalFiltered: number | null = null
  let totalFilesize: number | null = null

  // Id-scoped refreshes (select-mode bulk edit, scrape, etc.) must not compute or
  // cache totals: the cache key ignores `ids`, so writing COUNT for one selected
  // item would poison the next full library list as "1 of N".
  const hasIdScope = ids.length > 0
  if (!skipTotals && !hasIdScope) {
    const cachedFilteredTotals = getCachedFilteredTotals(totalsCacheKey)
    const cachedUnfilteredTotal = getCachedUnfilteredTotal(mediaTypeId as number | string)

    if (cachedFilteredTotals && cachedUnfilteredTotal != null) {
      totalUnfiltered = cachedUnfilteredTotal
      totalFiltered = cachedFilteredTotals.totalFiltered
      totalFilesize = cachedFilteredTotals.totalFilesize
    } else {
      const [totalsRows, unfilteredRows] = await Promise.all([
        queryAllAsync(db, buildFilteredTotalsSql(fromForCount, whereClause, needsDistinct), replacements),
        queryAllAsync(db, `SELECT COUNT(*) AS totalUnfiltered
           FROM media
           WHERE media.mediaTypeId = :mediaTypeId`, {mediaTypeId}),
      ])
      const totals = totalsRows?.[0] || {}
      const unfiltered = unfilteredRows?.[0] || {}
      totalUnfiltered = Number(unfiltered.totalUnfiltered) || 0
      totalFiltered = Number(totals.totalFiltered) || 0
      totalFilesize = Number(totals.totalFilesize) || 0
      setCachedFilteredTotals(totalsCacheKey, {
        totalFiltered,
        totalFilesize,
      })
      setCachedUnfilteredTotal(mediaTypeId as number | string, totalUnfiltered)
    }
  }

  let navigation
  if (includeNavigation) {
    const navSelect = needsDistinct
      ? getNavigationSelect().replace('SELECT', 'SELECT DISTINCT')
      : getNavigationSelect()
    const navRows = await queryAllAsync(db, `${navSelect}
      ${fromForSort}
      ${whereClause}
      ORDER BY ${sortExpr} ${sortDir}`, replacements)
    navigation = navRows.map(toNavigationItem)
  }

  const rows = pageIds.length
    ? await fetchBaseMediaRows(db, mediaTypeId, pageIds)
    : []
  const orderedRows = orderRowsByIds(rows, pageIds)
  const items = orderedRows.map(createItemShell)
  await attachMediaRelations(db, items, mediaTypeId, pageIds)

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

async function loadMediaItems(db: ApiDb, options: MediaLoadOptions = {}) {
  const fallbackReason = getMediaFilterSqlFallbackReason({
    mediaTypeId: options.mediaTypeId,
    ids: options.ids,
    filters: options.filters,
    find_duplicates: options.find_duplicates,
    duplicates_by: options.duplicates_by,
  })

  if (!fallbackReason) {
    return loadMediaItemsSql(db, options)
  }

  return loadMediaItemsLegacy(db, options, fallbackReason)
}

async function loadMediaPool(db: ApiDb, mediaTypeId: MediaId | null | undefined) {
  const rows = await fetchBaseMediaRows(db, mediaTypeId)
  const items = rows.map(createItemShell)
  await attachMediaRelations(db, items, mediaTypeId)
  return items
}

async function getFilteredMediaSummary(db: ApiDb, options: MediaLoadOptions = {}) {
  const {
    mediaTypeId,
    filters = [],
    sortBy = 'id',
    direction = 'desc',
    previewLimit = 4,
    find_duplicates = false,
    duplicates_by = 'filesize',
  } = options

  const fallbackReason = getMediaFilterSqlFallbackReason({
    mediaTypeId,
    filters,
    find_duplicates,
    duplicates_by,
  })

  if (fallbackReason) {
    const result = await loadMediaItemsLegacy(db, {
      ...options,
      limit: null,
      includeNavigation: false,
    }, fallbackReason)

    return {
      count: result.totalFiltered,
      previewIds: result.items.slice(0, previewLimit).map((item: LoadedMediaItem | NavigationMediaItem | AnyRecord) => item.id),
    }
  }

  const filterQuery = await resolveMediaListFilterQuery(db, {
    mediaTypeId,
    filters,
    find_duplicates,
    duplicates_by,
  })
  if (!filterQuery.ok) {
    const result = await loadMediaItemsLegacy(db, {
      ...options,
      limit: null,
      includeNavigation: false,
    }, filterQuery.reason)

    return {
      count: result.totalFiltered,
      previewIds: result.items.slice(0, previewLimit).map((item: LoadedMediaItem | NavigationMediaItem | AnyRecord) => item.id),
    }
  }

  const {whereSql, joinSql = '', needsDistinct = false, replacements} = filterQuery
  const whereClause = `WHERE ${whereSql}`
  const joinForFilters = requiresMetadataJoinForFilters(filters)
  const joinForSort = requiresMetadataJoinForSort(sortBy)
  const fromForCount = getMediaFromClause(joinForFilters, joinSql)
  const fromForSort = getMediaFromClause(joinForFilters || joinForSort, joinSql)
  const sortMetaType = resolveSortMetaType(db, sortBy)
  const sortExpr = getSortExpression(sortBy, sortMetaType)
  const sortDir = direction === 'asc' ? 'ASC' : 'DESC'
  const idSelect = buildMediaIdSelect(needsDistinct)

  const [countRows, previewRows] = await Promise.all([
    queryAllAsync(db, buildFilteredCountSql(fromForCount, whereClause, needsDistinct), replacements),
    queryAllAsync(db, `${idSelect}
      ${fromForSort}
      ${whereClause}
      ORDER BY ${sortExpr} ${sortDir}
      LIMIT :previewLimit`, {...replacements, previewLimit}),
  ])

  const totals = countRows[0] || {}

  return {
    count: Number(totals.totalFiltered) || 0,
    previewIds: previewRows.map((row: AnyRecord) => row.id),
  }
}

async function loadFilteredMediaIds(db: ApiDb, options: MediaLoadOptions = {}) {
  const fallbackReason = getMediaFilterSqlFallbackReason({
    mediaTypeId: options.mediaTypeId,
    filters: options.filters,
    find_duplicates: options.find_duplicates,
    duplicates_by: options.duplicates_by,
  })

  if (fallbackReason) {
    const result = await loadMediaItemsLegacy(db, {
      ...options,
      limit: null,
      includeNavigation: false,
    }, fallbackReason)

    return {
      ids: result.items.map((item: LoadedMediaItem | NavigationMediaItem | AnyRecord) => item.id),
      totalFiltered: result.totalFiltered,
      totalFilesize: result.totalFilesize,
    }
  }

  const {
    mediaTypeId,
    filters = [],
  } = options

  const filterQuery = await resolveMediaListFilterQuery(db, {
    mediaTypeId,
    filters,
    ids: [],
    find_duplicates: options.find_duplicates,
    duplicates_by: options.duplicates_by,
  })
  if (!filterQuery.ok) {
    const result = await loadMediaItemsLegacy(db, {
      ...options,
      limit: null,
      includeNavigation: false,
    }, filterQuery.reason)

    return {
      ids: result.items.map((item: LoadedMediaItem | NavigationMediaItem | AnyRecord) => item.id),
      totalFiltered: result.totalFiltered,
      totalFilesize: result.totalFilesize,
    }
  }

  const {whereSql, joinSql = '', needsDistinct = false, replacements} = filterQuery
  const whereClause = `WHERE ${whereSql}`
  const joinForFilters = requiresMetadataJoinForFilters(options.filters || [])
  const joinForSort = requiresMetadataJoinForSort(options.sortBy || 'id')
  const fromForCount = getMediaFromClause(joinForFilters, joinSql)
  const fromForSort = getMediaFromClause(joinForFilters || joinForSort, joinSql)
  const idSelect = buildMediaIdSelect(needsDistinct)
  const sortMetaType = resolveSortMetaType(db, options.sortBy || 'id')
  const sortExpr = getSortExpression(options.sortBy || 'id', sortMetaType)
  const sortDir = options.direction === 'asc' ? 'ASC' : 'DESC'

  const [countRows, idRows] = await Promise.all([
    queryAllAsync(db, buildFilteredTotalsSql(fromForCount, whereClause, needsDistinct), replacements),
    queryAllAsync(db, `${idSelect}
      ${fromForSort}
      ${whereClause}
      ORDER BY ${sortExpr} ${sortDir}`, replacements),
  ])

  const totals = countRows[0] || {}

  return {
    ids: idRows.map((row: AnyRecord) => row.id),
    totalFiltered: Number(totals.totalFiltered) || 0,
    totalFilesize: Number(totals.totalFilesize) || 0,
  }
}

async function loadMediaBasicsByIds(db: ApiDb, ids: MediaId[] = []) {
  if (!ids.length) return []

  return queryAllAsync(db,
    `SELECT id, path, name, basename, filesize, mediaTypeId
     FROM media
     WHERE id IN (:ids)`,
    {ids},
  )
}

async function loadMediaPlaylistItems(db: ApiDb, ids: MediaId[] = []) {
  if (!ids.length) return []

  const rows = await queryAllAsync(db,
    `SELECT
      id, path, name, basename, ext, mediaTypeId,
      filesize, rating, favorite, views, viewedAt
     FROM media
     WHERE id IN (:ids)`,
    {ids},
  )

  const orderedRows = orderRowsByIds(rows, ids)
  return orderedRows.map(createItemShell)
}

async function loadMediaForPlayback(db: ApiDb, ids: MediaId[] = []) {
  if (!ids.length) return []

  const rows = await fetchBaseMediaRows(db, null, ids)
  const orderedRows = orderRowsByIds(rows, ids)
  return orderedRows.map(createItemShell)
}

export {
  loadMediaItems,
  loadMediaPool,
  getFilteredMediaSummary,
  loadFilteredMediaIds,
  loadMediaBasicsByIds,
  loadMediaPlaylistItems,
  loadMediaForPlayback,
}

export {toNavigationItem} from './mediaItemsPresentation'
