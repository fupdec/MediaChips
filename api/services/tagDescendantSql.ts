import type { FilterLike } from '../types/db'

export interface TagLinkContext {
  table: string
  idColumn: string
  entityRef: string
}

export function filterIncludesDescendants(filter: FilterLike): boolean {
  const value = filter.includeDescendants
  return value === true || value === 1 || value === '1' || value === 'true'
}

export function shouldExpandTagFilter(_filter: FilterLike): boolean {
  return false
}

function descendantCte(tagIdsKey: string, cteName: string): string {
  return `WITH RECURSIVE ${cteName}(id) AS (
      SELECT id FROM tags
      WHERE id IN (${tagIdsKey})
        AND (deletedAt IS NULL OR deletedAt = '')
      UNION ALL
      SELECT t.id FROM tags t
      INNER JOIN ${cteName} ON t.parentTagId = ${cteName}.id
      WHERE t.deletedAt IS NULL OR t.deletedAt = ''
    )`
}

export function descendantTagIdsSql(tagIdsKey: string, cteName: string): string {
  return `(
    ${descendantCte(tagIdsKey, cteName)}
    SELECT id FROM ${cteName}
  )`
}

export function descendantLinkSubquery(
  ctx: TagLinkContext,
  metaKey: string,
  tagIdsKey: string,
  cteName: string,
): string {
  return `(
    ${descendantCte(tagIdsKey, cteName)}
    SELECT DISTINCT ${ctx.table}.${ctx.idColumn} AS ${ctx.idColumn}
    FROM ${ctx.table}
    INNER JOIN ${cteName} ON ${cteName}.id = ${ctx.table}.tagId
    WHERE ${ctx.table}.metaId = ${metaKey}
  )`
}

export function descendantMediaCountJoinSql(options: {
  linkTable: string
  alias: string
  extraJoins?: string
  extraWhere?: string
}): string {
  const extraJoins = options.extraJoins ? `\n  ${options.extraJoins}` : ''
  const extraWhere = options.extraWhere ? `\n    AND ${options.extraWhere}` : ''
  return `LEFT JOIN (
  SELECT ${options.linkTable}.tagId AS id, COUNT(*) AS cnt
  FROM ${options.linkTable}${extraJoins}
  INNER JOIN tags scoped ON scoped.id = ${options.linkTable}.tagId AND scoped.metaId = :metaId
  WHERE 1 = 1${extraWhere}
  GROUP BY ${options.linkTable}.tagId
) AS ${options.alias} ON ${options.alias}.id = tags.id`
}
