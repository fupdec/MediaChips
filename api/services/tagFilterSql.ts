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
import {
  joinFilterClauses,
  normalizeFiltersJoinMode,
} from '../utils/filtersJoinMode'

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
  const {metaId, ids = [], filtersJoin: filtersJoinRaw} = options
  const filtersJoin = normalizeFiltersJoinMode(filtersJoinRaw)

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

  const baseClauses = ['tags.metaId = :metaId']
  const filterClauses: string[] = []
  const joins: string[] = []
  let joinIndex = 0
  // Tag relation joins are unique-keyed (single-tag PK equality or SELECT DISTINCT
  // parentTagId for multi-tag `in` / GROUP BY for in-all/in-only), so list/totals
  // must not force DISTINCT or the two-phase grouping rehydrate path.
  const needsDistinct = false

  if (ids.length) {
    replacements.ids = ids
    baseClauses.push('tags.id IN (:ids)')
  }

  const activeFilters = normalizeActiveFilters(filters)

  for (let filterIndex = 0; filterIndex < activeFilters.length; filterIndex += 1) {
    const filter = activeFilters[filterIndex]
    // OR mode cannot use INNER JOIN relation filters: the join would AND-constrain
    // the whole result set while only WHERE predicates get OR'd. Use IN/NOT IN.
    if (filtersJoin !== 'or' && isTagRelationArrayFilter(filter)) {
      const tagIds = getTagArrayFilterTagIds(filter)
      if (canUseTagArrayJoin(filter, tagIds.length > 0)) {
        const join = buildTagRelationJoin(filter, `tf${joinIndex}`, nextParam)
        if (join) {
          applyTagArrayJoinResult(join, joins, filterClauses)
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
    filterClauses.push(`(${clause})`)
  }

  const joinedFilters = joinFilterClauses(filterClauses, filtersJoin)
  const clauses = joinedFilters ? [...baseClauses, joinedFilters] : baseClauses

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
    filtersJoin: queryOptions.filtersJoin,
  })
}

function getTagFilterSqlFallbackReason(options: TagFilterOptions = {}) {
  const result = resolveTagFilterQuery(options)
  return result.ok ? null : result.reason
}

function getTagFromClause(joinSql: string = '') {
  return joinSql ? `FROM tags\n${joinSql}` : 'FROM tags'
}

export type TagSortPlan = {
  expression: string
  /** 1:1 aggregate joins — safe with DISTINCT filter joins. Uses :metaId. */
  joinSql: string
}

/**
 * Pre-aggregate assignment counts with LEFT JOIN instead of correlated
 * subqueries in ORDER BY (≈100× faster on large tag categories).
 */
function getTagSortPlan(sortBy: string, sortMetaType?: string | null): TagSortPlan {
  if (sortBy === 'shuffle') {
    return {expression: 'RANDOM()', joinSql: ''}
  }

  if (sortBy === 'mediaCount' || sortBy === 'numberOfMedia' || sortBy === 'assignmentCount') {
    return {
      expression: '(COALESCE(tag_sort_media_assign.cnt, 0) + COALESCE(tag_sort_tag_assign.cnt, 0))',
      joinSql: `LEFT JOIN (
  SELECT tim.tagId AS id, COUNT(*) AS cnt
  FROM tagsInMedia tim
  INNER JOIN tags scoped ON scoped.id = tim.tagId AND scoped.metaId = :metaId
  GROUP BY tim.tagId
) AS tag_sort_media_assign ON tag_sort_media_assign.id = tags.id
LEFT JOIN (
  SELECT tit.tagId AS id, COUNT(*) AS cnt
  FROM tagsInTags tit
  INNER JOIN tags scoped ON scoped.id = tit.tagId AND scoped.metaId = :metaId
  GROUP BY tit.tagId
) AS tag_sort_tag_assign ON tag_sort_tag_assign.id = tags.id`,
    }
  }

  if (sortBy === 'videoCount' || sortBy === 'numberOfVideos') {
    return {
      expression: 'COALESCE(tag_sort_type_count.cnt, 0)',
      joinSql: `LEFT JOIN (
  SELECT tim.tagId AS id, COUNT(*) AS cnt
  FROM tagsInMedia tim
  INNER JOIN tags scoped ON scoped.id = tim.tagId AND scoped.metaId = :metaId
  INNER JOIN media ON media.id = tim.mediaId
  INNER JOIN mediaTypes ON mediaTypes.id = media.mediaTypeId
  WHERE mediaTypes.type = 'video'
  GROUP BY tim.tagId
) AS tag_sort_type_count ON tag_sort_type_count.id = tags.id`,
    }
  }

  if (sortBy === 'imageCount' || sortBy === 'numberOfImages') {
    return {
      expression: 'COALESCE(tag_sort_type_count.cnt, 0)',
      joinSql: `LEFT JOIN (
  SELECT tim.tagId AS id, COUNT(*) AS cnt
  FROM tagsInMedia tim
  INNER JOIN tags scoped ON scoped.id = tim.tagId AND scoped.metaId = :metaId
  INNER JOIN media ON media.id = tim.mediaId
  INNER JOIN mediaTypes ON mediaTypes.id = media.mediaTypeId
  WHERE mediaTypes.type = 'image'
  GROUP BY tim.tagId
) AS tag_sort_type_count ON tag_sort_type_count.id = tags.id`,
    }
  }

  if (sortBy === 'tagCount' || sortBy === 'numberOfTags' || sortBy === 'assignedTagCount') {
    return {
      expression: 'COALESCE(tag_sort_nested_count.cnt, 0)',
      joinSql: `LEFT JOIN (
  SELECT tit.parentTagId AS id, COUNT(*) AS cnt
  FROM tagsInTags tit
  INNER JOIN tags scoped ON scoped.id = tit.parentTagId AND scoped.metaId = :metaId
  GROUP BY tit.parentTagId
) AS tag_sort_nested_count ON tag_sort_nested_count.id = tags.id`,
    }
  }

  const metaId = resolveMetaId(sortBy)
  if (metaId !== null && sortMetaType) {
    return {expression: buildTagMetaSortExpression(metaId, sortMetaType), joinSql: ''}
  }

  return {expression: SORT_COLUMNS[sortBy] || SORT_COLUMNS.id, joinSql: ''}
}

function getTagSortExpression(sortBy: string, sortMetaType?: string | null) {
  return getTagSortPlan(sortBy, sortMetaType).expression
}

import {buildTagIdSelect} from './filteredListSql'

export {
  buildTagFilterQuery,
  resolveTagFilterQuery,
  getTagFilterSqlFallbackReason,
  getTagFromClause,
  getTagSortPlan,
  getTagSortExpression,
  buildTagIdSelect,
}
