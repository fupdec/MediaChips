import type { FilterLike } from '../types/db'
import type { SqlParamBinder } from '../types/mediaFilter'
import type { TagArrayJoinResult } from './tagArrayFilterSql'
import {normalizeFilterTagIds} from './tagArrayFilterSql'

/** SQL: media.path is under folderPaths.path (separator-normalized). */
export function buildMediaPathUnderFolderSql(
  mediaPathExpr = 'media.path',
  folderPathExpr = 'fp.path',
): string {
  return `REPLACE(${mediaPathExpr}, '\\', '/') LIKE RTRIM(REPLACE(${folderPathExpr}, '\\', '/'), '/') || '/%'`
}

/**
 * Build UNION of (mediaId, tagId) for direct tagsInMedia + inherited folder tags.
 * tagPredicate is appended after metaId check, using bare `tagId` column name for tagsInMedia
 * and rewritten to `tif.tagId` for the folder branch.
 */
function buildEffectiveMediaTagPairsSql(metaKey: string, tagPredicate = ''): string {
  const mediaPred = tagPredicate
  const folderPred = tagPredicate.replace(/\btagId\b/g, 'tif.tagId')

  return `(
    SELECT mediaId, tagId FROM tagsInMedia
    WHERE metaId = ${metaKey}${mediaPred}
    UNION
    SELECT media.id AS mediaId, tif.tagId AS tagId
    FROM media
    INNER JOIN folderPaths fp
    INNER JOIN tagsInFolders tif
      ON tif.folderId = fp.id
      AND tif.metaId = ${metaKey}${folderPred}
    WHERE ${buildMediaPathUnderFolderSql('media.path', 'fp.path')}
  )`
}

function buildMediaIdsWithAnyMetaTagSql(metaKey: string): string {
  return `(
    SELECT DISTINCT mediaId FROM tagsInMedia WHERE metaId = ${metaKey}
    UNION
    SELECT DISTINCT media.id AS mediaId
    FROM media
    INNER JOIN folderPaths fp
    INNER JOIN tagsInFolders tif
      ON tif.folderId = fp.id
      AND tif.metaId = ${metaKey}
    WHERE ${buildMediaPathUnderFolderSql('media.path', 'fp.path')}
  )`
}

function buildMediaIdsWithTagIdsSql(metaKey: string, tagsKey: string): string {
  return `(
    SELECT DISTINCT mediaId FROM tagsInMedia
    WHERE metaId = ${metaKey} AND tagId IN (${tagsKey})
    UNION
    SELECT DISTINCT media.id AS mediaId
    FROM media
    INNER JOIN folderPaths fp
    INNER JOIN tagsInFolders tif
      ON tif.folderId = fp.id
      AND tif.metaId = ${metaKey}
      AND tif.tagId IN (${tagsKey})
    WHERE ${buildMediaPathUnderFolderSql('media.path', 'fp.path')}
  )`
}

export function buildMediaTagArrayJoinResult(
  filter: FilterLike,
  alias: string,
  metaKey: string,
  nextParam: SqlParamBinder,
): TagArrayJoinResult | null {
  const {cond, val} = filter
  const tagIds = normalizeFilterTagIds(val)

  if (cond === 'is null') {
    return {
      join: `LEFT JOIN ${buildMediaIdsWithAnyMetaTagSql(metaKey)} ${alias} ON ${alias}.mediaId = media.id`,
      where: `${alias}.mediaId IS NULL`,
    }
  }

  if (cond === 'not null') {
    return `INNER JOIN ${buildMediaIdsWithAnyMetaTagSql(metaKey)} ${alias} ON ${alias}.mediaId = media.id`
  }

  if (!tagIds.length) return null

  if (cond === 'not in') {
    const tagsKey = nextParam(tagIds)
    return {
      join: `LEFT JOIN ${buildMediaIdsWithTagIdsSql(metaKey, tagsKey)} ${alias} ON ${alias}.mediaId = media.id`,
      where: `${alias}.mediaId IS NULL`,
    }
  }

  if (cond === 'not in all') {
    const tagsKey = nextParam(tagIds)
    const countKey = nextParam(tagIds.length)
    const pairs = buildEffectiveMediaTagPairsSql(metaKey, ` AND tagId IN (${tagsKey})`)
    return {
      join: `LEFT JOIN (
        SELECT mediaId FROM ${pairs} pairs
        GROUP BY mediaId
        HAVING COUNT(DISTINCT tagId) = ${countKey}
      ) ${alias} ON ${alias}.mediaId = media.id`,
      where: `${alias}.mediaId IS NULL`,
    }
  }

  if (cond === 'in all' && tagIds.length > 1) {
    const tagsKey = nextParam(tagIds)
    const countKey = nextParam(tagIds.length)
    const pairs = buildEffectiveMediaTagPairsSql(metaKey, ` AND tagId IN (${tagsKey})`)
    return `INNER JOIN (
      SELECT mediaId FROM ${pairs} pairs
      GROUP BY mediaId
      HAVING COUNT(DISTINCT tagId) = ${countKey}
    ) ${alias} ON ${alias}.mediaId = media.id`
  }

  if (cond === 'in only') {
    const tagsKey = nextParam(tagIds)
    const countKey = nextParam(tagIds.length)
    const pairs = buildEffectiveMediaTagPairsSql(metaKey, '')
    return `INNER JOIN (
      SELECT mediaId FROM ${pairs} pairs
      GROUP BY mediaId
      HAVING COUNT(DISTINCT tagId) = ${countKey}
        AND COUNT(DISTINCT CASE WHEN tagId IN (${tagsKey}) THEN tagId END) = ${countKey}
    ) ${alias} ON ${alias}.mediaId = media.id`
  }

  const tagsKey = nextParam(tagIds.length === 1 ? tagIds[0] : tagIds)

  if (cond === 'in' || cond === 'in all') {
    return `INNER JOIN ${buildMediaIdsWithTagIdsSql(metaKey, tagsKey)} ${alias} ON ${alias}.mediaId = media.id`
  }

  return null
}

export function buildMediaTagArrayFilterClause(
  metaKey: string,
  filter: FilterLike,
  nextParam: SqlParamBinder,
): string | null {
  const {cond, val} = filter
  const tagIds = normalizeFilterTagIds(val)

  if (cond === 'is null') {
    return `media.id NOT IN ${buildMediaIdsWithAnyMetaTagSql(metaKey)}`
  }

  if (cond === 'not null') {
    return `media.id IN ${buildMediaIdsWithAnyMetaTagSql(metaKey)}`
  }

  if (!tagIds.length) {
    if (cond === 'not in') return '1 = 1'
    if (cond === 'not in all') {
      return `media.id IN ${buildMediaIdsWithAnyMetaTagSql(metaKey)}`
    }
    return '0 = 1'
  }

  const tagsKey = nextParam(tagIds)

  if (cond === 'in') {
    return `media.id IN ${buildMediaIdsWithTagIdsSql(metaKey, tagsKey)}`
  }

  if (cond === 'not in') {
    return `media.id NOT IN ${buildMediaIdsWithTagIdsSql(metaKey, tagsKey)}`
  }

  if (cond === 'in all') {
    const countKey = nextParam(tagIds.length)
    const pairs = buildEffectiveMediaTagPairsSql(metaKey, ` AND tagId IN (${tagsKey})`)
    return `media.id IN (
      SELECT mediaId FROM ${pairs} pairs
      GROUP BY mediaId
      HAVING COUNT(DISTINCT tagId) = ${countKey}
    )`
  }

  if (cond === 'in only') {
    const countKey = nextParam(tagIds.length)
    const pairs = buildEffectiveMediaTagPairsSql(metaKey, '')
    return `media.id IN (
      SELECT mediaId FROM ${pairs} pairs
      GROUP BY mediaId
      HAVING COUNT(DISTINCT tagId) = ${countKey}
        AND COUNT(DISTINCT CASE WHEN tagId IN (${tagsKey}) THEN tagId END) = ${countKey}
    )`
  }

  if (cond === 'not in all') {
    const countKey = nextParam(tagIds.length)
    const pairs = buildEffectiveMediaTagPairsSql(metaKey, ` AND tagId IN (${tagsKey})`)
    return `media.id NOT IN (
      SELECT mediaId FROM ${pairs} pairs
      GROUP BY mediaId
      HAVING COUNT(DISTINCT tagId) = ${countKey}
    )`
  }

  return null
}
