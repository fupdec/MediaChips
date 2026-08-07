import type {ApiDb} from '../types/db'
import {queryAll} from '../db/utils/rawQuery'
import {createTagsInMediaRepository} from '../db/repositories/tagsInMedia'
import {findVisualSimilarIds} from './visualHashBackfill'

export type SimilarNeighborTagSuggestion = {
  tagId: number
  metaId: number
  name: string
  count: number
  neighborIds: number[]
}

export type SuggestTagsFromSimilarResult = {
  mediaId: number
  hasVisualHash: boolean
  neighborCount: number
  suggestions: SimilarNeighborTagSuggestion[]
  applied: number
}

type TagAggRow = {
  tagId: number
  metaId: number
  name: string
  count: number
}

function uniquePositiveIds(ids: Array<number | string | null | undefined>): number[] {
  return [...new Set(
    ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0),
  )]
}

/**
 * Suggest tags that appear often on visually similar neighbors but not on the seed.
 * Ranked by neighbor frequency.
 */
export function suggestTagsFromSimilarForMedia(
  db: ApiDb,
  mediaId: number,
  options: {
    neighborLimit?: number
    tagLimit?: number
    minCount?: number
    apply?: boolean
  } = {},
): SuggestTagsFromSimilarResult {
  const seedId = Number(mediaId)
  const neighborLimit = Math.max(1, Math.min(Number(options.neighborLimit) || 24, 80))
  const tagLimit = Math.max(1, Math.min(Number(options.tagLimit) || 12, 40))
  const minCount = Math.max(1, Number(options.minCount) || 1)

  if (!Number.isFinite(seedId) || seedId <= 0) {
    return {
      mediaId: seedId,
      hasVisualHash: false,
      neighborCount: 0,
      suggestions: [],
      applied: 0,
    }
  }

  const similar = findVisualSimilarIds(db, seedId, {limit: neighborLimit + 1})
  const neighborIds = similar.ids.filter((id) => id !== seedId).slice(0, neighborLimit)
  if (!similar.hasVisualHash || !neighborIds.length) {
    return {
      mediaId: seedId,
      hasVisualHash: similar.hasVisualHash,
      neighborCount: neighborIds.length,
      suggestions: [],
      applied: 0,
    }
  }

  const placeholders = neighborIds.map((_, index) => `:n${index}`).join(', ')
  const replacements: Record<string, unknown> = {seedId}
  neighborIds.forEach((id, index) => {
    replacements[`n${index}`] = id
  })

  const rows = queryAll<TagAggRow>(db, `
    SELECT
      tim.tagId AS tagId,
      tim.metaId AS metaId,
      tags.name AS name,
      COUNT(DISTINCT tim.mediaId) AS count
    FROM tagsInMedia tim
    INNER JOIN tags ON tags.id = tim.tagId
    WHERE tim.mediaId IN (${placeholders})
      AND NOT EXISTS (
        SELECT 1
        FROM tagsInMedia mine
        WHERE mine.mediaId = :seedId
          AND mine.tagId = tim.tagId
          AND mine.metaId = tim.metaId
      )
    GROUP BY tim.tagId, tim.metaId, tags.name
    HAVING COUNT(DISTINCT tim.mediaId) >= :minCount
    ORDER BY COUNT(DISTINCT tim.mediaId) DESC, tags.name COLLATE NOCASE ASC
    LIMIT :tagLimit
  `, {
    ...replacements,
    minCount,
    tagLimit,
  })

  const suggestions: SimilarNeighborTagSuggestion[] = rows.map((row) => ({
    tagId: Number(row.tagId),
    metaId: Number(row.metaId),
    name: String(row.name || ''),
    count: Number(row.count) || 0,
    neighborIds,
  })).filter((row) => row.tagId > 0 && row.metaId > 0 && row.name)

  let applied = 0
  if (options.apply && suggestions.length) {
    const repo = createTagsInMediaRepository(db.drizzle)
    const inserted = repo.bulkCreate(suggestions.map((tag) => ({
      mediaId: seedId,
      tagId: tag.tagId,
      metaId: tag.metaId,
    })))
    applied = inserted.length
  }

  return {
    mediaId: seedId,
    hasVisualHash: true,
    neighborCount: neighborIds.length,
    suggestions,
    applied,
  }
}

export function suggestTagsFromSimilarForMediaIds(
  db: ApiDb,
  mediaIds: Array<number | string>,
  options: {
    neighborLimit?: number
    tagLimit?: number
    minCount?: number
    apply?: boolean
  } = {},
): {
  items: SuggestTagsFromSimilarResult[]
  applied: number
  suggested: number
} {
  const ids = uniquePositiveIds(mediaIds)
  const items = ids.map((id) => suggestTagsFromSimilarForMedia(db, id, options))
  return {
    items,
    applied: items.reduce((sum, item) => sum + item.applied, 0),
    suggested: items.reduce((sum, item) => sum + item.suggestions.length, 0),
  }
}
