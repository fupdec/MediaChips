import type { ApiDb, AnyRecord } from '../types/db'
import type {
  LoadedMediaItem,
  MediaId,
  MediaLoadOptions,
  NavigationMediaItem,
} from '../types/mediaFilter'
import type { ParsedItem } from '../../app/types/items'
import { queryAllAsync } from '../db/utils/rawQuery'
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
  const pageItems = shouldPaginate
    ? slicePage(filtered, page, limit)
    : filtered

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
  const fromForCount = getMediaFromClause(joinForFilters, joinSql)
  const fromForSort = getMediaFromClause(joinForFilters || joinForSort, joinSql)
  const idSelect = buildMediaIdSelect(needsDistinct)

  const pageLimit = resolvePageLimit(limit)
  const shouldPaginate = shouldPaginateMediaList({ ids, limit })
  const safePage = Math.max(1, Number(page) || 1)
  const queryReplacements = {...replacements}

  let idQuery = `${idSelect}
    ${fromForSort}
    ${whereClause}
    ORDER BY ${sortExpr} ${sortDir}`

  if (shouldPaginate && pageLimit != null) {
    queryReplacements.limit = pageLimit
    queryReplacements.offset = (safePage - 1) * pageLimit
    idQuery += ' LIMIT :limit OFFSET :offset'
  }

  const queries = [queryAllAsync(db, idQuery, queryReplacements)]

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
      queries.push(
        queryAllAsync(db, buildFilteredTotalsSql(fromForCount, whereClause, needsDistinct), replacements),
        queryAllAsync(db, `SELECT COUNT(*) AS totalUnfiltered
           FROM media
           WHERE media.mediaTypeId = :mediaTypeId`, {mediaTypeId}),
      )
    }
  }

  const results = await Promise.all(queries)
  const idRows = results[0]

  if (!skipTotals && totalFiltered == null) {
    const totals = results[1]?.[0] || {}
    const unfiltered = results[2]?.[0] || {}
    totalUnfiltered = Number(unfiltered.totalUnfiltered) || 0
    totalFiltered = Number(totals.totalFiltered) || 0
    totalFilesize = Number(totals.totalFilesize) || 0
    setCachedFilteredTotals(totalsCacheKey, {
      totalFiltered,
      totalFilesize,
    })
    setCachedUnfilteredTotal(mediaTypeId as number | string, totalUnfiltered)
  }

  const pageIds: MediaId[] = idRows.map((row: AnyRecord) => row.id as MediaId)

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
