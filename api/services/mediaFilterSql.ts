import type { FilterLike, AnyRecord } from '../types/db'
import type {
  MediaFilterOptions,
  MediaFilterQueryResult,
  SqlParamBinder,
} from '../types/mediaFilter'
import {
  applyTagArrayJoinResult,
  canUseTagArrayJoin,
  getTagArrayFilterTagIds,
} from './tagArrayFilterSql'
import {
  buildMediaTagArrayFilterClause,
  buildMediaTagArrayJoinResult,
} from './mediaTagFilterSql'
import { resolveMetaId } from '../utils/metaId'
import { buildMediaMetaSortExpression } from '../utils/metaValueSort'
import {
  buildStringComparison,
} from './filterSqlCompare'
import {
  buildTypedEntityColumnClause,
  buildTypedMetaValueClause,
} from './filterTypedColumnSql'
import {
  buildCountryArrayClause,
  buildTagCountryMatchSql,
} from './countryFilterSql'
import {buildExtArrayClause} from './extFilterSql'
import {
  buildDuplicateMatchClauses,
  buildDuplicateValuesSubquery,
} from './mediaDuplicatesFilterSql'

const MEDIA_COLUMNS = new Set([
  'rating',
  'favorite',
  'bookmark',
  'views',
  'viewedAt',
  'createdAt',
  'updatedAt',
  'name',
  'path',
  'filesize',
  'basename',
  'ext',
])

const VIDEO_COLUMNS = new Set(['duration', 'bitrate', 'codec', 'fps', 'time'])
const DIMENSION_COLUMNS = new Set(['width', 'height'])
const IMAGE_ONLY_COLUMNS = new Set(['orientation'])

const SORT_COLUMNS = {
  id: 'media.id',
  rating: 'media.rating',
  favorite: 'media.favorite',
  bookmark: 'media.bookmark',
  views: 'media.views',
  viewedAt: 'media.viewedAt',
  createdAt: 'media.createdAt',
  updatedAt: 'media.updatedAt',
  name: 'media.name',
  path: 'media.path',
  filesize: 'media.filesize',
  basename: 'media.basename',
  ext: 'media.ext',
  duration: 'videoMetadata.duration',
  bitrate: 'videoMetadata.bitrate',
  codec: 'videoMetadata.codec',
  fps: 'videoMetadata.fps',
  time: 'videoMetadata.time',
  width: 'COALESCE(videoMetadata.width, imageMetadata.width)',
  height: 'COALESCE(videoMetadata.height, imageMetadata.height)',
  orientation: 'imageMetadata.orientation',
}

const MEDIA_FROM_JOIN = `
FROM media
LEFT JOIN videoMetadata ON media.id = videoMetadata.mediaId
LEFT JOIN imageMetadata ON media.id = imageMetadata.mediaId`

const NAVIGATION_SELECT = `SELECT
  media.id,
  media.path,
  media.name,
  media.basename,
  media.ext,
  media.mediaTypeId,
  media.filesize,
  COALESCE(videoMetadata.width, imageMetadata.width) AS width,
  COALESCE(videoMetadata.height, imageMetadata.height) AS height,
  videoMetadata.duration,
  media.rating,
  media.favorite,
  media.views,
  media.viewedAt,
  videoMetadata.time`

function isActiveFilter(filter: FilterLike) {
  const active = filter.active === true || filter.active === 1 || filter.active === '1'
  return active && filter.cond
}

function normalizeActiveFilters(filters: FilterLike[] = []) {
  return (filters || []).filter(isActiveFilter)
}

function sqlColumn(param: string | number) {
  const key = String(param)
  if (MEDIA_COLUMNS.has(key)) return `media.${key}`
  if (VIDEO_COLUMNS.has(key)) return `videoMetadata.${key}`
  if (DIMENSION_COLUMNS.has(key)) {
    return `COALESCE(videoMetadata.${key}, imageMetadata.${key})`
  }
  if (IMAGE_ONLY_COLUMNS.has(key)) return `imageMetadata.${key}`
  return null
}

function buildMetaValueClause(metaId: number | string, filter: FilterLike, nextParam: SqlParamBinder) {
  const metaKey = nextParam(metaId)
  const valueColumn = `(SELECT vim.value FROM valuesInMedia vim WHERE vim.mediaId = media.id AND vim.metaId = ${metaKey} LIMIT 1)`
  return buildTypedMetaValueClause(valueColumn, filter, nextParam)
}

function isTagArrayFilter(filter: FilterLike) {
  return (filter.type === 'array' || filter.type === 'select')
    && filter.param !== 'country'
    && filter.param !== 'ext'
    && resolveMetaId(filter.param) !== null
}

function buildTagArrayJoin(filter: FilterLike, alias: string, nextParam: SqlParamBinder) {
  const metaId = resolveMetaId(filter.param)
  if (metaId === null) return null
  const metaKey = nextParam(metaId)
  return buildMediaTagArrayJoinResult(filter, alias, metaKey, nextParam)
}

function buildTagArrayClause(metaId: number | string, filter: FilterLike, nextParam: SqlParamBinder) {
  const metaKey = nextParam(metaId)
  return buildMediaTagArrayFilterClause(metaKey, filter, nextParam)
}

function buildFilterClause(filter: FilterLike, nextParam: SqlParamBinder) {
  const {param, type, cond, val} = filter
  const metaId = resolveMetaId(param)

  if (type === 'array' || type === 'select') {
    if (param === 'country') return buildCountryArrayClause(filter, nextParam)
    if (param === 'ext') return buildExtArrayClause(filter, nextParam)
    if (metaId === null) return null
    return buildTagArrayClause(metaId, filter, nextParam)
  }

  if (metaId !== null) {
    return buildMetaValueClause(metaId, filter, nextParam)
  }

  if (param === undefined || param === null) return null

  const columnExpr = sqlColumn(param)
  if (!columnExpr) return null

  return buildTypedEntityColumnClause(columnExpr, filter, nextParam)
}

function unsupportedFilterResult(
  filter: FilterLike,
  index: number,
  reason: string,
): MediaFilterQueryResult {
  return {
    ok: false,
    reason,
    filter: {
      index,
      param: filter.param,
      type: filter.type,
      cond: filter.cond,
    },
  }
}

function missingMediaTypeResult(): MediaFilterQueryResult {
  return { ok: false, reason: 'Missing mediaTypeId' }
}

function buildDuplicatesFilterQuery(options: MediaFilterOptions & { duplicates_by?: string } = {}): MediaFilterQueryResult {
  const {ids = []} = options
  const duplicatesBy = options.duplicates_by || 'filesize'

  // Candidate set = active filters within media type (ids are applied after).
  const scope = buildMediaFilterQuery(options.filters || [], {
    mediaTypeId: options.mediaTypeId,
    ids: [],
  })
  if (!scope.ok) return scope

  const replacements: AnyRecord = {...scope.replacements}
  const clauses = [scope.whereSql]
  const duplicateValuesSubquery = buildDuplicateValuesSubquery(
    duplicatesBy,
    scope.joinSql,
    scope.whereSql,
  )
  clauses.push(...buildDuplicateMatchClauses(duplicatesBy, duplicateValuesSubquery))

  if (ids.length) {
    replacements.ids = ids
    clauses.push('media.id IN (:ids)')
  }

  return {
    ok: true,
    whereSql: clauses.join(' AND '),
    joinSql: scope.joinSql,
    needsDistinct: scope.needsDistinct,
    replacements,
  }
}

function resolveMediaFilterQuery(options: MediaFilterOptions & {
  filters?: FilterLike[]
  duplicates_by?: string
} = {}): MediaFilterQueryResult {
  if (options.find_duplicates) {
    return buildDuplicatesFilterQuery(options)
  }

  return buildMediaFilterQuery(options.filters || [], {
    mediaTypeId: options.mediaTypeId,
    ids: options.ids || [],
  })
}

function canUseSqlMediaLoader(options: MediaFilterOptions & {
  filters?: FilterLike[]
  duplicates_by?: string
} = {}) {
  return resolveMediaFilterQuery(options).ok
}

function getMediaFilterSqlFallbackReason(options: MediaFilterOptions & {
  filters?: FilterLike[]
  duplicates_by?: string
  find_duplicates?: boolean
} = {}) {
  const result = resolveMediaFilterQuery(options)
  return result.ok ? null : result.reason
}

function canUseSqlMediaFilters(options: MediaFilterOptions = {}) {
  const filters = normalizeActiveFilters(options.filters)
  for (const filter of filters) {
    if (isTagArrayFilter(filter)) {
      const tagIds = getTagArrayFilterTagIds(filter)
      if (canUseTagArrayJoin(filter, tagIds.length > 0)) {
        if (!buildTagArrayJoin(filter, 'tf0', () => ':p0')) return false
        continue
      }
    }
    if (!buildFilterClause(filter, () => ':p0')) return false
  }

  return true
}

function buildMediaFilterQuery(filters: FilterLike[] = [], options: MediaFilterOptions = {}): MediaFilterQueryResult {
  const {mediaTypeId, ids = []} = options

  if (mediaTypeId == null || mediaTypeId === '') {
    return missingMediaTypeResult()
  }

  const replacements: AnyRecord = {mediaTypeId}
  let paramIndex = 0

  const nextParam: SqlParamBinder = (value) => {
    const key = `f${paramIndex}`
    paramIndex += 1
    replacements[key] = value
    return `:${key}`
  }

  const clauses: string[] = ['media.mediaTypeId = :mediaTypeId']
  const joins: string[] = []
  let joinIndex = 0
  let needsDistinct = false

  if (ids.length) {
    replacements.ids = ids
    clauses.push('media.id IN (:ids)')
  }

  const activeFilters = normalizeActiveFilters(filters)

  for (let filterIndex = 0; filterIndex < activeFilters.length; filterIndex += 1) {
    const filter = activeFilters[filterIndex]
    if (isTagArrayFilter(filter)) {
      const tagIds = getTagArrayFilterTagIds(filter)
      if (canUseTagArrayJoin(filter, tagIds.length > 0)) {
        const join = buildTagArrayJoin(filter, `tf${joinIndex}`, nextParam)
        if (join) {
          applyTagArrayJoinResult(join, joins, clauses)
          joinIndex += 1
          if (filter.cond === 'in') {
            if (tagIds.length > 1) {
              needsDistinct = true
            }
          }
          continue
        }
      }
    }

    const clause = buildFilterClause(filter, nextParam)
    if (!clause) {
      return unsupportedFilterResult(
        filter,
        filterIndex,
        `Unsupported SQL filter for param=${String(filter.param)} type=${String(filter.type)} cond=${String(filter.cond)}`,
      )
    }
    clauses.push(`(${clause})`)
  }

  return {
    ok: true,
    whereSql: clauses.join(' AND '),
    joinSql: joins.join('\n'),
    needsDistinct,
    replacements,
  }
}

function requiresMetadataJoinForSort(sortBy: string) {
  return VIDEO_COLUMNS.has(sortBy)
    || DIMENSION_COLUMNS.has(sortBy)
    || IMAGE_ONLY_COLUMNS.has(sortBy)
}

function filterRequiresMetadataJoin(filter: FilterLike) {
  const metaId = resolveMetaId(filter.param)
  if (metaId !== null) return false
  if (filter.type === 'array' || filter.type === 'select') return false
  if (filter.param === undefined || filter.param === null) return false

  const param = String(filter.param)
  return VIDEO_COLUMNS.has(param)
    || DIMENSION_COLUMNS.has(param)
    || IMAGE_ONLY_COLUMNS.has(param)
}

function requiresMetadataJoinForFilters(filters: FilterLike[] = []) {
  return normalizeActiveFilters(filters).some(filterRequiresMetadataJoin)
}

function getMediaFromClause(needsMetadataJoin: boolean, joinSql: string = '') {
  const tagJoins = joinSql ? `\n${joinSql}` : ''

  if (needsMetadataJoin) {
    return `FROM media${tagJoins}
LEFT JOIN videoMetadata ON media.id = videoMetadata.mediaId
LEFT JOIN imageMetadata ON media.id = imageMetadata.mediaId`
  }

  return tagJoins ? `FROM media${tagJoins}` : 'FROM media'
}

function getSortExpression(sortBy: string, sortMetaType?: string | null) {
  if (sortBy === 'shuffle') return 'RANDOM()'

  const metaId = resolveMetaId(sortBy)
  if (metaId !== null && sortMetaType) {
    return buildMediaMetaSortExpression(metaId, sortMetaType)
  }

  return SORT_COLUMNS[sortBy as keyof typeof SORT_COLUMNS] || SORT_COLUMNS.id
}

function getMediaFromJoin() {
  return MEDIA_FROM_JOIN
}

function getNavigationSelect() {
  return NAVIGATION_SELECT
}

export {
  buildMediaFilterQuery,
  buildDuplicatesFilterQuery,
  resolveMediaFilterQuery,
  buildCountryArrayClause,
  buildTagCountryMatchSql,
  buildStringComparison,
  canUseSqlMediaFilters,
  canUseSqlMediaLoader,
  getMediaFilterSqlFallbackReason,
  filterRequiresMetadataJoin,
  getMediaFromClause,
  getMediaFromJoin,
  getNavigationSelect,
  getSortExpression,
  normalizeActiveFilters,
  requiresMetadataJoinForFilters,
  requiresMetadataJoinForSort,
}
