import type { ApiDb } from '../types/db'
import { queryAll } from '../db/utils/rawQuery'

export interface CooccurringTagRow {
  id: number
  name: string
  metaId: number
  color: string | null
}

/**
 * Distinct tags that appear on media which already have `tagId`.
 * Optionally scoped to a media type. Excludes `tagId` itself.
 */
export function findCooccurringTags(
  db: ApiDb,
  tagId: number,
  mediaTypeId?: number | null,
): CooccurringTagRow[] {
  if (!Number.isFinite(tagId) || tagId <= 0) return []

  const mediaType = mediaTypeId != null && Number.isFinite(Number(mediaTypeId))
    ? Number(mediaTypeId)
    : null

  // Self-join on mediaId: seed rows for the page tag → other tags on the same media.
  // Avoids a slow DISTINCT outer join against the full media table.
  if (mediaType != null) {
    return queryAll<CooccurringTagRow>(db, `
      SELECT DISTINCT
        tags.id AS id,
        tags.name AS name,
        tags.metaId AS metaId,
        tags.color AS color
      FROM tagsInMedia seed
      INNER JOIN media ON media.id = seed.mediaId AND media.mediaTypeId = :mediaTypeId
      INNER JOIN tagsInMedia other
        ON other.mediaId = seed.mediaId
        AND other.tagId != :tagId
      INNER JOIN tags ON tags.id = other.tagId
      WHERE seed.tagId = :tagId
      ORDER BY tags.metaId ASC, tags.name COLLATE NOCASE ASC
    `, {tagId, mediaTypeId: mediaType})
  }

  return queryAll<CooccurringTagRow>(db, `
    SELECT DISTINCT
      tags.id AS id,
      tags.name AS name,
      tags.metaId AS metaId,
      tags.color AS color
    FROM tagsInMedia seed
    INNER JOIN tagsInMedia other
      ON other.mediaId = seed.mediaId
      AND other.tagId != :tagId
    INNER JOIN tags ON tags.id = other.tagId
    WHERE seed.tagId = :tagId
    ORDER BY tags.metaId ASC, tags.name COLLATE NOCASE ASC
  `, {tagId})
}
