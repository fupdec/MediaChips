import type { FilterLike } from '../types/db'
import type { SqlParamBinder } from '../types/mediaFilter'
import {
  descendantLinkSubquery,
  descendantTagIdsSql,
  shouldExpandTagFilter,
  type TagLinkContext,
} from './tagDescendantSql'

export type { TagLinkContext }

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

export {normalizeTagIds as normalizeFilterTagIds}

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

  if (shouldExpandTagFilter(filter)) {
    if (cond === 'not in') {
      const tagsKey = nextParam(tagIds)
      return {
        join: `LEFT JOIN ${descendantLinkSubquery(ctx, metaKey, tagsKey, `${alias}_tree`)} ${alias} ON ${alias}.${ctx.idColumn} = ${ctx.entityRef}`,
        where: `${alias}.${ctx.idColumn} IS NULL`,
      }
    }

    if (cond === 'in all' && tagIds.length > 1) {
      return tagIds.map((tagId, index) => {
        const tagsKey = nextParam(tagId)
        const partAlias = `${alias}_${index}`
        return `INNER JOIN ${descendantLinkSubquery(ctx, metaKey, tagsKey, `${partAlias}_tree`)} ${partAlias} ON ${partAlias}.${ctx.idColumn} = ${ctx.entityRef}`
      }).join('\n')
    }

    const tagsKey = nextParam(tagIds.length === 1 ? tagIds[0] : tagIds)
    return `INNER JOIN ${descendantLinkSubquery(ctx, metaKey, tagsKey, `${alias}_tree`)} ${alias} ON ${alias}.${ctx.idColumn} = ${ctx.entityRef}`
  }

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
    // PK (entityId, tagId, metaId) makes a single-tag equality join unique-keyed.
    return `INNER JOIN ${ctx.table} ${alias} ON ${alias}.${ctx.idColumn} = ${ctx.entityRef} AND ${alias}.metaId = ${metaKey} AND ${alias}.tagId = ${tagsKey}`
  }

  if (cond === 'in') {
    // Multi-tag OR would otherwise fan out one row per matching child tag.
    // Distinct id subquery keeps list/count paths off needsDistinct.
    return `INNER JOIN (
      SELECT DISTINCT ${ctx.idColumn}
      FROM ${ctx.table}
      WHERE metaId = ${metaKey} AND tagId IN (${tagsKey})
    ) ${alias} ON ${alias}.${ctx.idColumn} = ${ctx.entityRef}`
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

  if (shouldExpandTagFilter(filter)) {
    if (cond === 'in' || (cond === 'in all' && tagIds.length === 1)) {
      return `${ctx.entityRef} IN (
        SELECT DISTINCT ${ctx.idColumn}
        FROM ${ctx.table}
        WHERE metaId = ${metaKey} AND tagId IN ${descendantTagIdsSql(tagsKey, `${ctx.table}_tree`)}
      )`
    }
    if (cond === 'not in') {
      return `${ctx.entityRef} NOT IN (
        SELECT DISTINCT ${ctx.idColumn}
        FROM ${ctx.table}
        WHERE metaId = ${metaKey} AND tagId IN ${descendantTagIdsSql(tagsKey, `${ctx.table}_tree`)}
      )`
    }
    if (cond === 'in all') {
      const parts = tagIds.map((tagId, index) => {
        const oneKey = nextParam(tagId)
        return `${ctx.entityRef} IN (
          SELECT DISTINCT ${ctx.idColumn}
          FROM ${ctx.table}
          WHERE metaId = ${metaKey} AND tagId IN ${descendantTagIdsSql(oneKey, `${ctx.table}_tree_${index}`)}
        )`
      })
      return parts.join(' AND ')
    }
  }

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
