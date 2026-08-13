import type {ApiDb} from '../types/db'
import {queryAll, queryGet} from '../db/utils/rawQuery'
import {jaccardSimilarity, type MediaSimilaritySignalHit} from './mediaSimilarityRanking'

export type TagSimilarityHit = MediaSimilaritySignalHit & {
  sharedCount: number
  tagCount: number
}

export type FindSimilarByTagsResult = {
  seedId: number
  hasTags: boolean
  seedTagCount: number
  hits: TagSimilarityHit[]
  ids: number[]
}

function clampLimit(limit?: number | null, fallback = 24): number {
  const n = Math.floor(Number(limit))
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(n, 80)
}

/** Distinct tag ids linked directly to a media row. */
export function loadMediaTagIds(db: ApiDb, mediaId: number): number[] {
  const id = Number(mediaId)
  if (!Number.isFinite(id) || id <= 0) return []
  const rows = queryAll<{tagId?: number}>(db, `
    SELECT DISTINCT tagId AS tagId
    FROM tagsInMedia
    WHERE mediaId = :mediaId
  `, {mediaId: id})
  return rows
    .map((row) => Number(row.tagId))
    .filter((tagId) => Number.isFinite(tagId) && tagId > 0)
}

/**
 * Neighbors that share tags with the seed, ranked by Jaccard overlap.
 * Uses direct tagsInMedia links (folder inheritance is type-scoped elsewhere).
 */
export function findSimilarByTags(
  db: ApiDb,
  seedId: number,
  options: {limit?: number; minShared?: number} = {},
): FindSimilarByTagsResult {
  const id = Number(seedId)
  const limit = clampLimit(options.limit)
  const minShared = Math.max(1, Math.floor(Number(options.minShared) || 1))

  if (!Number.isFinite(id) || id <= 0) {
    return {seedId: id, hasTags: false, seedTagCount: 0, hits: [], ids: []}
  }

  const seedTagCountRow = queryGet<{count?: number}>(db, `
    SELECT COUNT(DISTINCT tagId) AS count
    FROM tagsInMedia
    WHERE mediaId = :mediaId
  `, {mediaId: id})
  const seedTagCount = Number(seedTagCountRow?.count) || 0
  if (seedTagCount <= 0) {
    return {seedId: id, hasTags: false, seedTagCount: 0, hits: [], ids: []}
  }

  // Over-fetch shared candidates, then rank by Jaccard in JS.
  const candidateLimit = Math.min(Math.max(limit * 4, limit), 200)
  const rows = queryAll<{mediaId?: number; shared?: number; tagCount?: number}>(db, `
    WITH seed_tags AS (
      SELECT DISTINCT tagId AS tagId
      FROM tagsInMedia
      WHERE mediaId = :seedId
    ),
    shared AS (
      SELECT
        tim.mediaId AS mediaId,
        COUNT(DISTINCT tim.tagId) AS shared
      FROM tagsInMedia tim
      INNER JOIN seed_tags st ON st.tagId = tim.tagId
      WHERE tim.mediaId != :seedId
      GROUP BY tim.mediaId
      HAVING COUNT(DISTINCT tim.tagId) >= :minShared
      ORDER BY COUNT(DISTINCT tim.tagId) DESC, tim.mediaId ASC
      LIMIT :candidateLimit
    )
    SELECT
      shared.mediaId AS mediaId,
      shared.shared AS shared,
      (
        SELECT COUNT(DISTINCT tim2.tagId)
        FROM tagsInMedia tim2
        WHERE tim2.mediaId = shared.mediaId
      ) AS tagCount
    FROM shared
  `, {
    seedId: id,
    minShared,
    candidateLimit,
  })

  const hits: TagSimilarityHit[] = rows
    .map((row) => {
      const mediaId = Number(row.mediaId)
      const sharedCount = Number(row.shared) || 0
      const tagCount = Number(row.tagCount) || 0
      if (!Number.isFinite(mediaId) || mediaId <= 0 || sharedCount <= 0) return null
      return {
        id: mediaId,
        sharedCount,
        tagCount,
        score: jaccardSimilarity(sharedCount, seedTagCount, tagCount),
      }
    })
    .filter(Boolean)
    .sort((a, b) => (
      (b as TagSimilarityHit).score! - (a as TagSimilarityHit).score!
      || (b as TagSimilarityHit).sharedCount - (a as TagSimilarityHit).sharedCount
      || (a as TagSimilarityHit).id - (b as TagSimilarityHit).id
    ))
    .slice(0, limit) as TagSimilarityHit[]

  return {
    seedId: id,
    hasTags: true,
    seedTagCount,
    hits,
    ids: hits.map((hit) => hit.id),
  }
}
