import type { FilterLike } from '../types/db'
import type { TagFilterOptions, TagFilterQueryResult } from '../types/tagFilter'
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
import {normalizeActiveFilters} from './mediaFilterSql'
import {buildTagCountryArrayClause} from './countryFilterSql'
import {
  buildTypedEntityColumnClause,
  buildTypedMetaValueClause,
} from './filterTypedColumnSql'

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

function isTagRelationArrayFilter(filter: FilterLike) {
  return (filter.type === 'array' || filter.type === 'select')
    && filter.param !== 'country'
    && resolveMetaId(filter.param) !== null
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
  const metaKey = nextParam(metaId)
  const valueColumn = `(SELECT vit.value FROM valuesInTags vit WHERE vit.tagId = tags.id AND vit.metaId = ${metaKey} LIMIT 1)`
  return buildTypedMetaValueClause(valueColumn, filter, nextParam)
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

  return buildTypedEntityColumnClause(columnExpr, filter, nextParam)
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
  // Tag relation joins are unique-keyed (single-tag PK equality or SELECT DISTINCT
  // parentTagId for multi-tag `in` / GROUP BY for in-all/in-only), so list/totals
  // must not force DISTINCT or the two-phase grouping rehydrate path.
  const needsDistinct = false

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

import {buildTagIdSelect} from './filteredListSql'

export {
  buildTagFilterQuery,
  resolveTagFilterQuery,
  getTagFilterSqlFallbackReason,
  getTagFromClause,
  getTagSortExpression,
  buildTagIdSelect,
}
