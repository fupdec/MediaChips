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
  getMediaFilterSqlFallbackReason,
  getMediaFromClause,
  getNavigationSelect,
  getSortExpression,
  normalizeActiveFilters,
  requiresMetadataJoinForFilters,
  requiresMetadataJoinForSort,
  resolveMediaFilterQuery,
} from './mediaFilterSql'
import {
  buildFilteredTotalsCacheKey,
  getCachedFilteredTotals,
  getCachedUnfilteredTotal,
  setCachedFilteredTotals,
  setCachedUnfilteredTotal,
} from './mediaListTotalsCache'

import { runFilterItemsAsync } from './filterItemsWorkerRunner'
import {
  resolvePageLimit,
  shouldPaginateMediaList,
  slicePage,
} from './mediaItemsPagination'
import { resolveSortMetaType } from './resolveSortMetaType'
import {
  aggregateGroupedItems,
  resolveListGroupBy,
  type BuildItemGroupsOptions,
  type GroupableItem,
  type ItemsGroupBy,
  type ItemsGroupSummary,
} from '../../shared/itemsGroupBy'
import { createMetaRepository } from '../db/repositories/meta'

const GROUP_SLIM_SELECT = `SELECT
  media.id,
  media.path,
  media.name,
  media.basename,
  media.ext,
  media.mediaTypeId,
  media.filesize,
  media.rating,
  media.favorite,
  media.views,
  media.viewedAt,
  media.createdAt,
  media.updatedAt,
  COALESCE(videoMetadata.width, imageMetadata.width) AS width,
  COALESCE(videoMetadata.height, imageMetadata.height) AS height,
  videoMetadata.duration,
  videoMetadata.bitrate,
  videoMetadata.codec,
  videoMetadata.fps,
  videoMetadata.time`

function shouldLogLegacyMediaLoader() {
  return process.env.NODE_ENV !== 'production'
    || process.env.MEDIA_CHIPS_LOG_LEGACY_MEDIA_LOADER === '1'
}

function warnLegacyMediaLoader(reason: string, options: MediaLoadOptions = {}) {
  if (!shouldLogLegacyMediaLoader()) return

  const activeFilterCount = normalizeActiveFilters(options.filters).length
  console.warn(
    '[mediaItemsLoader] Using legacy JS filter path:',
    reason,
    `(mediaTypeId=${options.mediaTypeId ?? 'none'}, activeFilters=${activeFilterCount}, sortBy=${options.sortBy ?? 'id'})`,
  )
}

function buildFilteredTotalsSql(fromClause: string, whereClause: string, needsDistinct: boolean) {
  if (!needsDistinct) {
    return `SELECT COUNT(*) AS totalFiltered,
      COALESCE(SUM(media.filesize), 0) AS totalFilesize
      ${fromClause}
      ${whereClause}`
  }

  return `SELECT COUNT(*) AS totalFiltered,
    COALESCE(SUM(filesize), 0) AS totalFilesize
    FROM (
      SELECT DISTINCT media.id, media.filesize
      ${fromClause}
      ${whereClause}
    )`
}

function buildFilteredCountSql(fromClause: string, whereClause: string, needsDistinct: boolean) {
  if (!needsDistinct) {
    return `SELECT COUNT(*) AS totalFiltered
      ${fromClause}
      ${whereClause}`
  }

  return `SELECT COUNT(*) AS totalFiltered
    FROM (
      SELECT DISTINCT media.id
      ${fromClause}
      ${whereClause}
    )`
}

function buildMediaIdSelect(needsDistinct: boolean) {
  return needsDistinct ? 'SELECT DISTINCT media.id' : 'SELECT media.id'
}

const MEDIA_BASE_SELECT = `SELECT media.*,
  videoMetadata.duration,
  videoMetadata.bitrate,
  videoMetadata.codec,
  videoMetadata.fps,
  videoMetadata.time,
  COALESCE(videoMetadata.width, imageMetadata.width) AS width,
  COALESCE(videoMetadata.height, imageMetadata.height) AS height,
  imageMetadata.orientation
FROM media
LEFT JOIN videoMetadata ON media.id = videoMetadata.mediaId
LEFT JOIN imageMetadata ON media.id = imageMetadata.mediaId`

const toNavigationItem = (item: NavigationMediaItem) => ({
  id: item.id,
  path: item.path,
  name: item.name,
  basename: item.basename,
  ext: item.ext,
  mediaTypeId: item.mediaTypeId,
  filesize: item.filesize,
  width: item.width,
  height: item.height,
  duration: item.duration,
  rating: item.rating,
  favorite: item.favorite,
  views: item.views,
  viewedAt: item.viewedAt,
  time: item.time,
})

const createItemShell = (row: AnyRecord): LoadedMediaItem => ({
  ...row,
  tags: [],
  values: [],
  key: String(row.id),
})

async function attachPinnedMetaForGrouping(
  db: ApiDb,
  items: GroupableItem[],
  metaId: number,
  metaType: string | null | undefined,
): Promise<BuildItemGroupsOptions> {
  const mediaIds = items
    .map((item) => Number(item.id))
    .filter((id) => Number.isFinite(id))
  if (!mediaIds.length) {
    return {metaId, metaType: metaType || null}
  }

  const type = String(metaType || '')
  const isTagMeta = !type || type === 'array' || type === 'select'
  const tagsByMediaId = new Map<number, Array<{tagId: number; metaId: number}>>()
  const valuesByMediaId = new Map<number, Array<{metaId: number; value: unknown}>>()
  const tagNameById = new Map<number, string>()

  for (const chunk of chunkArray(mediaIds)) {
    if (isTagMeta) {
      const tagRows = await queryAllAsync(db,
        `SELECT mediaId, tagId, metaId FROM tagsInMedia
         WHERE mediaId IN (:mediaIds) AND metaId = :metaId`,
        {mediaIds: chunk, metaId},
      )
      for (const row of tagRows) {
        const mediaId = Number(row.mediaId)
        const tagId = Number(row.tagId)
        if (!Number.isFinite(mediaId) || !Number.isFinite(tagId)) continue
        if (!tagsByMediaId.has(mediaId)) tagsByMediaId.set(mediaId, [])
        tagsByMediaId.get(mediaId)!.push({tagId, metaId: Number(row.metaId)})
      }
    } else {
      const valueRows = await queryAllAsync(db,
        `SELECT mediaId, value, metaId FROM valuesInMedia
         WHERE mediaId IN (:mediaIds) AND metaId = :metaId`,
        {mediaIds: chunk, metaId},
      )
      for (const row of valueRows) {
        const mediaId = Number(row.mediaId)
        if (!Number.isFinite(mediaId)) continue
        if (!valuesByMediaId.has(mediaId)) valuesByMediaId.set(mediaId, [])
        valuesByMediaId.get(mediaId)!.push({
          metaId: Number(row.metaId),
          value: row.value,
        })
      }
    }
  }

  if (isTagMeta && tagsByMediaId.size) {
    const tagIds = [...new Set(
      [...tagsByMediaId.values()].flatMap((rows) => rows.map((row) => row.tagId)),
    )]
    for (const chunk of chunkArray(tagIds)) {
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
    item.tags = tagsByMediaId.get(id) || []
    item.values = valuesByMediaId.get(id) || []
  }

  return {
    metaId,
    metaType: metaType || (isTagMeta ? 'array' : 'string'),
    resolveTagName: (tagId) => tagNameById.get(Number(tagId)) || `#${tagId}`,
  }
}

async function buildMediaGroupsFromSlimRows(
  db: ApiDb,
  slimRows: AnyRecord[],
  groupBy: ItemsGroupBy,
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
      ...(await attachPinnedMetaForGrouping(db, items, groupMetaId, metaType)),
      direction: direction || 'asc',
    }
  }

  return aggregateGroupedItems(items, groupBy, sortBy, options)
}

function sliceOrderedIds(orderedIds: number[], page: number, limit: number | null | undefined): number[] {
  const pageLimit = resolvePageLimit(limit)
  if (pageLimit == null) return orderedIds
  const safePage = Math.max(1, Number(page) || 1)
  const start = (safePage - 1) * pageLimit
  return orderedIds.slice(start, start + pageLimit)
}

async function fetchBaseMediaRows(db: ApiDb, mediaTypeId: MediaId | null | undefined, ids: MediaId[] = []) {
  if (ids.length) {
    const rows = await queryAllAsync(db,
      `${MEDIA_BASE_SELECT} WHERE media.id IN (:ids)`,
      {ids},
    )
    return rows
  }

  if (!mediaTypeId) return []

  const rows = await queryAllAsync(db,
    `${MEDIA_BASE_SELECT} WHERE media.mediaTypeId = :mediaTypeId`,
    {mediaTypeId},
  )
  return rows
}

async function attachMediaRelations(db: ApiDb, items: LoadedMediaItem[], mediaTypeId: MediaId | null | undefined, ids: MediaId[] = []) {
  if (!items.length) return items

  const mediaIds = items.map((item: LoadedMediaItem | NavigationMediaItem | AnyRecord) => item.id)
  const idSet = new Set(mediaIds)
  const useIdFilter = ids.length > 0

  const tagQuery = useIdFilter
    ? `SELECT mediaId, tagId, metaId FROM tagsInMedia WHERE mediaId IN (:mediaIds)`
    : `SELECT tim.mediaId, tim.tagId, tim.metaId
       FROM tagsInMedia tim
       INNER JOIN media m ON m.id = tim.mediaId
       WHERE m.mediaTypeId = :mediaTypeId`

  const valueQuery = useIdFilter
    ? `SELECT mediaId, value, metaId FROM valuesInMedia WHERE mediaId IN (:mediaIds)`
    : `SELECT vim.mediaId, vim.value, vim.metaId
       FROM valuesInMedia vim
       INNER JOIN media m ON m.id = vim.mediaId
       WHERE m.mediaTypeId = :mediaTypeId`

  const replacements = useIdFilter
    ? {mediaIds}
    : {mediaTypeId}

  const tagRows = await queryAllAsync(db, tagQuery, replacements)
  const valueRows = await queryAllAsync(db, valueQuery, replacements)

  const tagsByMediaId = new Map()
  const valuesByMediaId = new Map()

  for (const row of tagRows) {
    if (!idSet.has(row.mediaId)) continue
    if (!tagsByMediaId.has(row.mediaId)) tagsByMediaId.set(row.mediaId, [])
    tagsByMediaId.get(row.mediaId).push({
      tagId: Number(row.tagId),
      metaId: Number(row.metaId),
    })
  }

  for (const row of valueRows) {
    if (!idSet.has(row.mediaId)) continue
    if (!valuesByMediaId.has(row.mediaId)) valuesByMediaId.set(row.mediaId, [])
    valuesByMediaId.get(row.mediaId).push({
      value: row.value,
      metaId: Number(row.metaId),
    })
  }

  for (const item of items) {
    item.tags = tagsByMediaId.get(item.id) || []
    item.values = valuesByMediaId.get(item.id) || []
  }

  return items
}

function orderRowsByIds(rows: AnyRecord[], ids: MediaId[]): AnyRecord[] {
  const rowsById = new Map(rows.map((row: AnyRecord) => [row.id, row]))
  return ids.map((id: MediaId) => rowsById.get(id)).filter((row): row is AnyRecord => row != null)
}

async function loadMediaItemsLegacy(
  db: ApiDb,
  options: MediaLoadOptions = {},
  fallbackReason?: string,
) {
  if (fallbackReason) {
    warnLegacyMediaLoader(fallbackReason, options)
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
      ? sliceOrderedIds(aggregated.orderedIds, page, limit)
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

  const filterQuery = resolveMediaFilterQuery({
    mediaTypeId,
    ids,
    filters,
    find_duplicates: options.find_duplicates,
    duplicates_by: options.duplicates_by,
  })
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
      ? sliceOrderedIds(aggregated.orderedIds, safePage, limit)
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

  if (!skipTotals) {
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

  const result: AnyRecord = {
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

  const filterQuery = resolveMediaFilterQuery({
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

  const filterQuery = resolveMediaFilterQuery({
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
  toNavigationItem,
}
