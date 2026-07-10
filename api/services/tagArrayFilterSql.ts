import type { FilterLike } from '../types/db'
import type { SqlParamBinder } from '../types/mediaFilter'

export interface TagLinkContext {
  table: string
  idColumn: string
  entityRef: string
}

export const MEDIA_TAG_LINK: TagLinkContext = {
  table: 'tagsInMedia',
  idColumn: 'mediaId',
  entityRef: 'media.id',
}

export const TAG_RELATION_LINK: TagLinkContext = {
  table: 'tagsInTags',
  idColumn: 'parentTagId',
  entityRef: 'tags.id',
}

export type TagArrayJoinResult = string | { join: string; where: string }

function normalizeTagIds(val: unknown) {
  return Array.isArray(val)
    ? val.filter((id: unknown) => id !== null && id !== undefined && id !== '')
    : []
}

export function getTagArrayFilterTagIds(filter: FilterLike) {
  return normalizeTagIds(filter.val)
}

export function canUseTagArrayJoin(filter: FilterLike, hasTagIds: boolean) {
  const {cond} = filter
  if (cond === 'is null' || cond === 'not null') return true
  return (cond === 'in'
    || cond === 'in all'
    || cond === 'in only'
    || cond === 'not in'
    || cond === 'not in all') && hasTagIds
}

export function buildTagArrayJoinResult(
  ctx: TagLinkContext,
  filter: FilterLike,
  alias: string,
  metaKey: string,
  nextParam: SqlParamBinder,
): TagArrayJoinResult | null {
  const {cond, val} = filter
  const tagIds = normalizeTagIds(val)

  if (cond === 'is null') {
    return {
      join: `LEFT JOIN (
        SELECT DISTINCT ${ctx.idColumn} AS ${ctx.idColumn}
        FROM ${ctx.table}
        WHERE metaId = ${metaKey}
      ) ${alias} ON ${alias}.${ctx.idColumn} = ${ctx.entityRef}`,
      where: `${alias}.${ctx.idColumn} IS NULL`,
    }
  }

  if (cond === 'not null') {
    return `INNER JOIN (
      SELECT DISTINCT ${ctx.idColumn}
      FROM ${ctx.table}
      WHERE metaId = ${metaKey}
    ) ${alias} ON ${alias}.${ctx.idColumn} = ${ctx.entityRef}`
  }

  if (!tagIds.length) return null

  if (cond === 'not in') {
    const tagsKey = nextParam(tagIds)
    return {
      join: `LEFT JOIN (
        SELECT DISTINCT ${ctx.idColumn} AS ${ctx.idColumn}
        FROM ${ctx.table}
        WHERE metaId = ${metaKey} AND tagId IN (${tagsKey})
      ) ${alias} ON ${alias}.${ctx.idColumn} = ${ctx.entityRef}`,
      where: `${alias}.${ctx.idColumn} IS NULL`,
    }
  }

  if (cond === 'not in all') {
    const tagsKey = nextParam(tagIds)
    const countKey = nextParam(tagIds.length)
    return {
      join: `LEFT JOIN (
        SELECT ${ctx.idColumn}
        FROM ${ctx.table}
        WHERE metaId = ${metaKey} AND tagId IN (${tagsKey})
        GROUP BY ${ctx.idColumn}
        HAVING COUNT(DISTINCT tagId) = ${countKey}
      ) ${alias} ON ${alias}.${ctx.idColumn} = ${ctx.entityRef}`,
      where: `${alias}.${ctx.idColumn} IS NULL`,
    }
  }

  if (cond === 'in all' && tagIds.length > 1) {
    const tagsKey = nextParam(tagIds)
    const countKey = nextParam(tagIds.length)
    return `INNER JOIN (
      SELECT ${ctx.idColumn}
      FROM ${ctx.table}
      WHERE metaId = ${metaKey} AND tagId IN (${tagsKey})
      GROUP BY ${ctx.idColumn}
      HAVING COUNT(DISTINCT tagId) = ${countKey}
    ) ${alias} ON ${alias}.${ctx.idColumn} = ${ctx.entityRef}`
  }

  if (cond === 'in only') {
    const tagsKey = nextParam(tagIds)
    const countKey = nextParam(tagIds.length)
    return `INNER JOIN (
      SELECT ${ctx.idColumn}
      FROM ${ctx.table}
      WHERE metaId = ${metaKey}
      GROUP BY ${ctx.idColumn}
      HAVING COUNT(DISTINCT tagId) = ${countKey}
        AND COUNT(DISTINCT CASE WHEN tagId IN (${tagsKey}) THEN tagId END) = ${countKey}
    ) ${alias} ON ${alias}.${ctx.idColumn} = ${ctx.entityRef}`
  }

  const tagsKey = nextParam(tagIds.length === 1 ? tagIds[0] : tagIds)
  if (tagIds.length === 1) {
    return `INNER JOIN ${ctx.table} ${alias} ON ${alias}.${ctx.idColumn} = ${ctx.entityRef} AND ${alias}.metaId = ${metaKey} AND ${alias}.tagId = ${tagsKey}`
  }

  if (cond === 'in') {
    return `INNER JOIN ${ctx.table} ${alias} ON ${alias}.${ctx.idColumn} = ${ctx.entityRef} AND ${alias}.metaId = ${metaKey} AND ${alias}.tagId IN (${tagsKey})`
  }

  return null
}

export function buildTagArrayFilterClause(
  ctx: TagLinkContext,
  metaKey: string,
  filter: FilterLike,
  nextParam: SqlParamBinder,
): string | null {
  const {cond, val} = filter
  const tagIds = normalizeTagIds(val)

  if (cond === 'is null') {
    return `${ctx.entityRef} NOT IN (
      SELECT DISTINCT ${ctx.idColumn}
      FROM ${ctx.table}
      WHERE metaId = ${metaKey}
    )`
  }

  if (cond === 'not null') {
    return `${ctx.entityRef} IN (
      SELECT DISTINCT ${ctx.idColumn}
      FROM ${ctx.table}
      WHERE metaId = ${metaKey}
    )`
  }

  if (!tagIds.length) {
    if (cond === 'not in') return '1 = 1'
    if (cond === 'not in all') {
      return `${ctx.entityRef} IN (
        SELECT DISTINCT ${ctx.idColumn}
        FROM ${ctx.table}
        WHERE metaId = ${metaKey}
      )`
    }
    return '0 = 1'
  }

  const tagsKey = nextParam(tagIds)

  if (cond === 'in') {
    return `${ctx.entityRef} IN (
      SELECT DISTINCT ${ctx.idColumn}
      FROM ${ctx.table}
      WHERE metaId = ${metaKey} AND tagId IN (${tagsKey})
    )`
  }

  if (cond === 'not in') {
    return `${ctx.entityRef} NOT IN (
      SELECT DISTINCT ${ctx.idColumn}
      FROM ${ctx.table}
      WHERE metaId = ${metaKey} AND tagId IN (${tagsKey})
    )`
  }

  if (cond === 'in all') {
    const countKey = nextParam(tagIds.length)
    return `${ctx.entityRef} IN (
      SELECT ${ctx.idColumn}
      FROM ${ctx.table}
      WHERE metaId = ${metaKey} AND tagId IN (${tagsKey})
      GROUP BY ${ctx.idColumn}
      HAVING COUNT(DISTINCT tagId) = ${countKey}
    )`
  }

  if (cond === 'in only') {
    const countKey = nextParam(tagIds.length)
    return `${ctx.entityRef} IN (
      SELECT ${ctx.idColumn}
      FROM ${ctx.table}
      WHERE metaId = ${metaKey}
      GROUP BY ${ctx.idColumn}
      HAVING COUNT(DISTINCT tagId) = ${countKey}
        AND COUNT(DISTINCT CASE WHEN tagId IN (${tagsKey}) THEN tagId END) = ${countKey}
    )`
  }

  if (cond === 'not in all') {
    const countKey = nextParam(tagIds.length)
    return `${ctx.entityRef} NOT IN (
      SELECT ${ctx.idColumn}
      FROM ${ctx.table}
      WHERE metaId = ${metaKey} AND tagId IN (${tagsKey})
      GROUP BY ${ctx.idColumn}
      HAVING COUNT(DISTINCT tagId) = ${countKey}
    )`
  }

  return null
}

export function applyTagArrayJoinResult(
  result: TagArrayJoinResult,
  joins: string[],
  clauses: string[],
) {
  if (typeof result === 'string') {
    joins.push(result)
    return
  }

  joins.push(result.join)
  clauses.push(`(${result.where})`)
}
