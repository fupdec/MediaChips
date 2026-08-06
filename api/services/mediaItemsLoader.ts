import type { ApiDb, AnyRecord } from '../types/db'
import type {
  MediaId,
  MediaLoadOptions,
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
import {
  buildMediaListGroupingCacheKey,
  getCachedMediaListGrouping,
  setCachedMediaListGrouping,
} from './mediaListGroupingCache'

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
  attachMediaRelations,
  buildGroupSlimSelect,
  buildMediaGroupsFromSlimRows,
  fetchBaseMediaRows,
  groupSlimNeedsMetadataJoin,
} from './mediaItemsRelations'
import {
  appendIdQueryLimitOffset,
  assembleMediaListResult,
  buildFilteredIdsFromListResult,
  buildMediaSummaryFromListResult,
  buildVisualNearDuplicateFilterSuccess,
  parseListTotalsRows,
  resolveCachedListTotals,
  resolveGroupedPageIds,
  resolveMediaListSqlParts,
  shouldComputeListTotals,
} from './mediaItemsListSql'
import {createMetaRepository} from '../db/repositories/meta'
import {
  buildMediaGroupBySqlPlan,
  buildMediaGroupOrderSqlExpr,
  buildMediaGroupSummariesFromRows,
  buildMediaGroupSummarySql,
  buildMediaGroupedIdOrderSql,
  supportsSqlMediaGroupBy,
} from './mediaGroupBySql'

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
  return buildVisualNearDuplicateFilterSuccess(mediaTypeId, nearIds, ids)
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
    const pageIds = resolveGroupedPageIds(aggregated.orderedIds, {
      shouldPaginate,
      page,
      limit,
    })
    const byId = new Map(filtered.map((item) => [Number(item.id), item]))
    pageItems = pageIds
      .map((id) => byId.get(Number(id)))
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
  const sortMetaType = resolveSortMetaType(db, sortBy)
  const sortExpr = getSortExpression(sortBy, sortMetaType)
  const {groupBy, metaId: groupMetaId} = resolveListGroupBy(options.groupBy, 'media')
  const groupingActive = groupBy !== 'none'
  const groupSlimSelect = groupingActive
    ? buildGroupSlimSelect(groupBy, sortBy)
    : ''
  const {
    whereClause,
    fromForCount,
    fromForSort,
    idSelect,
    sortDir,
  } = resolveMediaListSqlParts({
    whereSql,
    joinSql,
    needsDistinct,
    filters,
    sortBy,
    direction,
    includeGroupingJoin: groupingActive && groupSlimNeedsMetadataJoin(groupBy, sortBy),
  })

  const pageLimit = resolvePageLimit(limit)
  const shouldPaginate = shouldPaginateMediaList({ ids, limit })
  const safePage = Math.max(1, Number(page) || 1)
  const queryReplacements = {...replacements}

  let pageIds: MediaId[] = []
  let groups: ItemsGroupSummary[] | undefined

  if (groupingActive) {
    let groupByMetaType = options.groupByMetaType || null
    if (groupBy === 'pinnedMeta' && groupMetaId != null && !groupByMetaType) {
      groupByMetaType = createMetaRepository(db.drizzle).findById(groupMetaId)?.type || 'array'
    }

    const canCacheGrouping = !ids.length
    const groupingCacheKey = canCacheGrouping
      ? buildMediaListGroupingCacheKey({
          mediaTypeId,
          filters,
          find_duplicates: options.find_duplicates,
          duplicates_by: options.duplicates_by,
          groupBy,
          sortBy,
          direction,
          groupMetaId,
          groupByMetaType,
        })
      : null
    const cachedGrouping = groupingCacheKey
      ? getCachedMediaListGrouping(groupingCacheKey)
      : null


    const groupPlan = supportsSqlMediaGroupBy(groupBy, {
      metaId: groupMetaId,
      metaType: groupByMetaType,
      mediaTypeId,
    })
      ? buildMediaGroupBySqlPlan(groupBy, sortBy, {
          metaId: groupMetaId,
          metaType: groupByMetaType,
          mediaTypeId,
        })
      : null
    const useSqlGrouping = Boolean(groupPlan)

    if (useSqlGrouping && groupPlan) {
      // SQL summaries + LIMIT/OFFSET page ids — no full-library slim load.
      const fromForGroup = groupPlan.joinSql
        ? `${fromForSort}\n${groupPlan.joinSql}`
        : fromForSort
      const groupReplacements = {
        ...replacements,
        ...groupPlan.replacements,
      }
      Object.assign(queryReplacements, groupPlan.replacements || {})

      if (cachedGrouping) {
        groups = cachedGrouping.groups
      } else {
        const summarySql = buildMediaGroupSummarySql(
          groupPlan.groupKeyExpr,
          fromForGroup,
          whereClause,
          {labelExpr: groupPlan.labelExpr},
        )
        const summaryRows = await queryAllAsync(db, summarySql, groupReplacements) as Array<{
          groupKey?: unknown
          count?: unknown
          groupLabel?: unknown
        }>
        groups = buildMediaGroupSummariesFromRows(
          summaryRows,
          groupBy,
          sortBy,
          direction,
          {
            metaId: groupPlan.metaId ?? groupMetaId,
            metaType: groupPlan.metaType ?? groupByMetaType,
          },
        )
        if (groupingCacheKey) {
          setCachedMediaListGrouping(groupingCacheKey, {
            groups,
            orderedIds: [],
          })
        }
      }

      const groupOrderExpr = buildMediaGroupOrderSqlExpr(
        groupPlan.groupKeyExpr,
        groupBy,
        direction,
        {
          labelExpr: groupPlan.labelExpr,
          metaType: groupPlan.metaType ?? groupByMetaType,
        },
      )
      const idQuery = appendIdQueryLimitOffset(
        buildMediaGroupedIdOrderSql(
          idSelect,
          fromForGroup,
          whereClause,
          groupOrderExpr,
          sortExpr,
          sortDir,
        ),
        queryReplacements,
        {shouldPaginate, pageLimit, safePage},
      )
      const idRows = await queryAllAsync(db, idQuery, queryReplacements)
      pageIds = idRows.map((row: AnyRecord) => row.id as MediaId)
    } else if (cachedGrouping?.orderedIds?.length) {
      groups = cachedGrouping.groups
      pageIds = resolveGroupedPageIds(cachedGrouping.orderedIds, {
        shouldPaginate,
        page: safePage,
        limit,
      }) as MediaId[]
    } else {
      let slimRows: AnyRecord[]
      if (needsDistinct) {
        const allIdRows = await queryAllAsync(db, `${idSelect}
          ${fromForSort}
          ${whereClause}
          ORDER BY ${sortExpr} ${sortDir}`, replacements)
        const allIds = allIdRows.map((row: AnyRecord) => row.id as MediaId)
        const rowsById = new Map<MediaId, AnyRecord>()
        const needsMetaJoin = groupSlimNeedsMetadataJoin(groupBy, sortBy)
        const rehydrateFrom = needsMetaJoin
          ? `FROM media
           LEFT JOIN videoMetadata ON media.id = videoMetadata.mediaId
           LEFT JOIN imageMetadata ON media.id = imageMetadata.mediaId`
          : 'FROM media'
        for (const chunk of chunkArray(allIds)) {
          const chunkRows = await queryAllAsync(db,
            `${groupSlimSelect}
             ${rehydrateFrom}
             WHERE media.id IN (:ids)`,
            {ids: chunk},
          )
          for (const row of chunkRows) {
            rowsById.set(row.id as MediaId, row)
          }
        }
        slimRows = orderRowsByIds([...rowsById.values()], allIds)
      } else {
        slimRows = await queryAllAsync(db, `${groupSlimSelect}
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
        groupByMetaType,
        direction,
      )
      groups = aggregated.groups
      if (groupingCacheKey) {
        setCachedMediaListGrouping(groupingCacheKey, {
          groups: aggregated.groups,
          orderedIds: aggregated.orderedIds,
        })
      }
      pageIds = resolveGroupedPageIds(aggregated.orderedIds, {
        shouldPaginate,
        page: safePage,
        limit,
      }) as MediaId[]
    }
  } else {
    const idQuery = appendIdQueryLimitOffset(
      `${idSelect}
      ${fromForSort}
      ${whereClause}
      ORDER BY ${sortExpr} ${sortDir}`,
      queryReplacements,
      {shouldPaginate, pageLimit, safePage},
    )

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
  if (shouldComputeListTotals({skipTotals, ids})) {
    const cached = resolveCachedListTotals({
      cachedFilteredTotals: getCachedFilteredTotals(totalsCacheKey),
      cachedUnfilteredTotal: getCachedUnfilteredTotal(mediaTypeId as number | string),
    })

    if (cached) {
      totalUnfiltered = cached.totalUnfiltered
      totalFiltered = cached.totalFiltered
      totalFilesize = cached.totalFilesize
    } else {
      const [totalsRows, unfilteredRows] = await Promise.all([
        queryAllAsync(db, buildFilteredTotalsSql(fromForCount, whereClause, needsDistinct), replacements),
        queryAllAsync(db, `SELECT COUNT(*) AS totalUnfiltered
           FROM media
           WHERE media.mediaTypeId = :mediaTypeId`, {mediaTypeId}),
      ])
      const parsed = parseListTotalsRows(totalsRows?.[0], unfilteredRows?.[0])
      totalUnfiltered = parsed.totalUnfiltered
      totalFiltered = parsed.totalFiltered
      totalFilesize = parsed.totalFilesize
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

  return assembleMediaListResult({
    items,
    totalUnfiltered,
    totalFiltered,
    totalFilesize,
    navigation,
    groups,
    shouldPaginate,
    safePage,
    pageLimit,
    skipTotals,
  })
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

    return buildMediaSummaryFromListResult(result, previewLimit)
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

    return buildMediaSummaryFromListResult(result, previewLimit)
  }

  const {whereSql, joinSql = '', needsDistinct = false, replacements} = filterQuery
  const sortMetaType = resolveSortMetaType(db, sortBy)
  const sortExpr = getSortExpression(sortBy, sortMetaType)
  const {
    whereClause,
    fromForCount,
    fromForSort,
    idSelect,
    sortDir,
  } = resolveMediaListSqlParts({
    whereSql,
    joinSql,
    needsDistinct,
    filters,
    sortBy,
    direction,
  })

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

    return buildFilteredIdsFromListResult(result)
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

    return buildFilteredIdsFromListResult(result)
  }

  const {whereSql, joinSql = '', needsDistinct = false, replacements} = filterQuery
  const sortBy = options.sortBy || 'id'
  const sortMetaType = resolveSortMetaType(db, sortBy)
  const sortExpr = getSortExpression(sortBy, sortMetaType)
  const {
    whereClause,
    fromForCount,
    fromForSort,
    idSelect,
    sortDir,
  } = resolveMediaListSqlParts({
    whereSql,
    joinSql,
    needsDistinct,
    filters: options.filters || [],
    sortBy,
    direction: options.direction,
  })

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
    `SELECT
      media.id,
      media.path,
      media.name,
      media.basename,
      media.filesize,
      media.mediaTypeId,
      media.rating,
      media.views,
      media.favorite,
      media.createdAt,
      videoMetadata.duration,
      COALESCE(videoMetadata.width, imageMetadata.width) AS width,
      COALESCE(videoMetadata.height, imageMetadata.height) AS height
     FROM media
     LEFT JOIN videoMetadata ON media.id = videoMetadata.mediaId
     LEFT JOIN imageMetadata ON media.id = imageMetadata.mediaId
     WHERE media.id IN (:ids)`,
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
