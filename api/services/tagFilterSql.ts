import type { FilterLike } from '../types/db'
import type { FilterCondition, TagFilterOptions, TagFilterQueryResult } from '../types/tagFilter'
import type { SqlParamBinder } from '../types/mediaFilter'
import {
  applyTagArrayJoinResult,
  buildTagArrayFilterClause,
  buildTagArrayJoinResult,
  canUseTagArrayJoin,
  getTagArrayFilterTagIds,
  TAG_RELATION_LINK,
} from './tagArrayFilterSql'
import { resolveMetaId } from '../utils/metaId'
import { buildTagMetaSortExpression } from '../utils/metaValueSort'
import {
  buildStringComparison,
  buildTagCountryMatchSql,
  normalizeActiveFilters,
} from './mediaFilterSql'

const TAG_COLUMNS = new Set([
  'rating',
  'favorite',
  'bookmark',
  'views',
  'viewedAt',
  'createdAt',
  'updatedAt',
  'name',
  'synonyms',
  'country',
  'color',
])

const SORT_COLUMNS: Record<string, string> = {
  id: 'tags.id',
  rating: 'tags.rating',
  favorite: 'tags.favorite',
  bookmark: 'tags.bookmark',
  views: 'tags.views',
  viewedAt: 'tags.viewedAt',
  createdAt: 'tags.createdAt',
  updatedAt: 'tags.updatedAt',
  name: 'tags.name',
  synonyms: 'tags.synonyms',
  country: 'tags.country',
  color: 'tags.color',
}

function sqlColumn(param: string | number) {
  const key = String(param)
  if (TAG_COLUMNS.has(key)) return `tags.${key}`
  return null
}

function compareNumberSql(columnExpr: string, cond: FilterCondition, valueKey: string) {
  const valueExpr = `CAST(${columnExpr} AS REAL)`
  switch (cond) {
    case 'equal':
    case '=':
      return `${valueExpr} = CAST(${valueKey} AS REAL)`
    case 'not equal':
    case '!==':
      return `${valueExpr} != CAST(${valueKey} AS REAL)`
    case 'greater than':
    case '>':
      return `${valueExpr} > CAST(${valueKey} AS REAL)`
    case 'less than':
    case '<':
      return `${valueExpr} < CAST(${valueKey} AS REAL)`
    case 'greater than or equal':
    case '>=':
      return `${valueExpr} >= CAST(${valueKey} AS REAL)`
    case 'less than or equal':
    case '<=':
      return `${valueExpr} <= CAST(${valueKey} AS REAL)`
    default:
      return null
  }
}

function buildDateComparison(columnExpr: string, cond: FilterCondition, value: unknown, nextParam: SqlParamBinder) {
  const valueKey = nextParam(value)
  const columnTime = `CAST(strftime('%s', ${columnExpr}) AS INTEGER)`
  const filterTime = `CAST(strftime('%s', ${valueKey}) AS INTEGER)`

  switch (cond) {
    case 'equal':
    case '=':
      return `${columnTime} = ${filterTime}`
    case 'not equal':
    case '!==':
      return `${columnTime} != ${filterTime}`
    case 'greater than':
    case '>':
      return `${columnTime} > ${filterTime}`
    case 'less than':
    case '<':
      return `${columnTime} < ${filterTime}`
    case 'greater than or equal':
    case '>=':
      return `${columnTime} >= ${filterTime}`
    case 'less than or equal':
    case '<=':
      return `${columnTime} <= ${filterTime}`
    default:
      return null
  }
}

function isTagRelationArrayFilter(filter: FilterLike) {
  return (filter.type === 'array' || filter.type === 'select')
    && filter.param !== 'country'
    && resolveMetaId(filter.param) !== null
}

function buildTagCountryArrayClause(filter: FilterLike, nextParam: SqlParamBinder) {
  const {cond, val} = filter
  const countries = Array.isArray(val)
    ? val.filter((entry: unknown) => entry !== null && entry !== undefined && entry !== '')
    : []

  const countryExistsSql = `(tags.country IS NOT NULL AND tags.country != '')`

  if (cond === 'is null') {
    return `NOT ${countryExistsSql}`
  }

  if (cond === 'not null') {
    return countryExistsSql
  }

  if (!countries.length) {
    if (cond === 'not in') return '1 = 1'
    if (cond === 'not in all') return countryExistsSql
    return '0 = 1'
  }

  const countryMatchClauses = countries.map((country: unknown) => {
    const countryKey = nextParam(String(country))
    return buildTagCountryMatchSql('tags', countryKey)
  })

  if (cond === 'in') {
    return `(${countryMatchClauses.join(' OR ')})`
  }

  if (cond === 'not in') {
    return `NOT (${countryMatchClauses.join(' OR ')})`
  }

  if (cond === 'in all') {
    return countryMatchClauses.map((clause) => `(${clause})`).join(' AND ')
  }

  if (cond === 'not in all') {
    const matchAllSql = countryMatchClauses.map((clause) => `(${clause})`).join(' AND ')
    return `NOT (${matchAllSql})`
  }

  return null
}

function buildTagRelationJoin(filter: FilterLike, alias: string, nextParam: SqlParamBinder) {
  const metaId = resolveMetaId(filter.param)
  if (metaId === null) return null
  const metaKey = nextParam(metaId)
  return buildTagArrayJoinResult(TAG_RELATION_LINK, filter, alias, metaKey, nextParam)
}

function buildTagRelationArrayClause(metaId: number | string, filter: FilterLike, nextParam: SqlParamBinder) {
  const metaKey = nextParam(metaId)
  return buildTagArrayFilterClause(TAG_RELATION_LINK, metaKey, filter, nextParam)
}

function buildMetaValueClause(metaId: number | string, filter: FilterLike, nextParam: SqlParamBinder) {
  const {type, cond, val} = filter
  const metaKey = nextParam(metaId)
  const valueColumn = `(SELECT vit.value FROM valuesInTags vit WHERE vit.tagId = tags.id AND vit.metaId = ${metaKey} LIMIT 1)`

  if (type === 'boolean') {
    if (cond === '!=') {
      return `NOT (COALESCE(${valueColumn}, '') IN ('1', 1, 'true', 'TRUE'))`
    }
    return `COALESCE(${valueColumn}, '') IN ('1', 1, 'true', 'TRUE')`
  }

  if (type === 'date') {
    const clause = buildDateComparison(valueColumn, cond, val, nextParam)
    return clause ? `(${clause})` : null
  }

  if (type === 'number' || type === 'rating') {
    if (val === null || val === undefined || val === '') return '0 = 1'
    const valueKey = nextParam(val)
    const clause = compareNumberSql(`CAST(${valueColumn} AS REAL)`, cond, valueKey)
    return clause
      ? `(${valueColumn} IS NOT NULL AND ${valueColumn} != '' AND ${clause})`
      : null
  }

  if (type === 'string') {
    const clause = buildStringComparison(valueColumn, cond, val, nextParam)
    return clause ? `(${clause})` : null
  }

  return null
}

function buildFilterClause(filter: FilterLike, nextParam: SqlParamBinder) {
  const {param, type, cond} = filter
  const metaId = resolveMetaId(param)

  if (type === 'array' || type === 'select') {
    if (param === 'country') return buildTagCountryArrayClause(filter, nextParam)
    if (metaId === null) return null
    return buildTagRelationArrayClause(metaId, filter, nextParam)
  }

  if (metaId !== null) {
    return buildMetaValueClause(metaId, filter, nextParam)
  }

  if (param === undefined || param === null) return null

  const columnExpr = sqlColumn(param)
  if (!columnExpr) return null

  const {val} = filter

  if (type === 'boolean') {
    if (cond === '!=') {
      return `NOT (COALESCE(${columnExpr}, 0) IN (1, '1', 'true', 'TRUE'))`
    }
    return `COALESCE(${columnExpr}, 0) IN (1, '1', 'true', 'TRUE')`
  }

  if (type === 'date') {
    const clause = buildDateComparison(columnExpr, cond, val, nextParam)
    return clause || null
  }

  if (type === 'number' || type === 'rating') {
    if (val === null || val === undefined || val === '') return '0 = 1'
    const valueKey = nextParam(val)
    const clause = compareNumberSql(columnExpr, cond, valueKey)
    return clause
      ? `(${columnExpr} IS NOT NULL AND ${columnExpr} != '' AND ${clause})`
      : null
  }

  if (type === 'string') {
    const clause = buildStringComparison(columnExpr, cond, val, nextParam)
    return clause || null
  }

  return null
}

function unsupportedFilterResult(
  filter: FilterLike,
  index: number,
  reason: string,
): TagFilterQueryResult {
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

function missingMetaIdResult(): TagFilterQueryResult {
  return { ok: false, reason: 'Missing metaId' }
}

function buildTagFilterQuery(filters: FilterLike[] = [], options: TagFilterOptions = {}): TagFilterQueryResult {
  const {metaId, ids = []} = options

  if (metaId == null || metaId === '') {
    return missingMetaIdResult()
  }

  const replacements: Record<string, unknown> = {metaId}
  let paramIndex = 0

  const nextParam: SqlParamBinder = (value) => {
    const key = `f${paramIndex}`
    paramIndex += 1
    replacements[key] = value
    return `:${key}`
  }

  const clauses = ['tags.metaId = :metaId']
  const joins: string[] = []
  let joinIndex = 0
  let needsDistinct = false

  if (ids.length) {
    replacements.ids = ids
    clauses.push('tags.id IN (:ids)')
  }

  const activeFilters = normalizeActiveFilters(filters)

  for (let filterIndex = 0; filterIndex < activeFilters.length; filterIndex += 1) {
    const filter = activeFilters[filterIndex]
    if (isTagRelationArrayFilter(filter)) {
      const tagIds = getTagArrayFilterTagIds(filter)
      if (canUseTagArrayJoin(filter, tagIds.length > 0)) {
        const join = buildTagRelationJoin(filter, `tf${joinIndex}`, nextParam)
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
        `Unsupported tag filter: param=${String(filter.param)} type=${String(filter.type)} cond=${String(filter.cond)}`,
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

function resolveTagFilterQuery(options: TagFilterOptions = {}): TagFilterQueryResult {
  // Duplicate finder is a media-library feature; tag lists use the normal SQL path.
  const {find_duplicates: _findDuplicates, ...queryOptions} = options

  return buildTagFilterQuery(queryOptions.filters || [], {
    metaId: queryOptions.metaId,
    ids: queryOptions.ids || [],
  })
}

function getTagFilterSqlFallbackReason(options: TagFilterOptions = {}) {
  const result = resolveTagFilterQuery(options)
  return result.ok ? null : result.reason
}

function getTagFromClause(joinSql: string = '') {
  return joinSql ? `FROM tags\n${joinSql}` : 'FROM tags'
}

function getTagSortExpression(sortBy: string, sortMetaType?: string | null) {
  if (sortBy === 'shuffle') return 'RANDOM()'

  const metaId = resolveMetaId(sortBy)
  if (metaId !== null && sortMetaType) {
    return buildTagMetaSortExpression(metaId, sortMetaType)
  }

  return SORT_COLUMNS[sortBy] || SORT_COLUMNS.id
}

function buildTagIdSelect(needsDistinct: boolean) {
  return needsDistinct ? 'SELECT DISTINCT tags.id' : 'SELECT tags.id'
}

export {
  buildTagFilterQuery,
  resolveTagFilterQuery,
  getTagFilterSqlFallbackReason,
  getTagFromClause,
  getTagSortExpression,
  buildTagIdSelect,
}
