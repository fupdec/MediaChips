import type {GlobalSearchTagResult} from './ftsQuery'
import {resolveGlobalSearchTagMatch} from './ftsQuery'
import {normalizeSearchTagIds} from './globalSearchMerge'

export interface SearchGlobalOptions {
  limit?: unknown
  tagIds?: unknown
}

export interface SearchTagsByNameOptions {
  limit?: unknown
  metaId?: number | null
  /** Only tags that appear on media having ALL of these tags. */
  cooccurWithTagIds?: number[]
  /** Exclude these tag ids from results (typically the pinned ones). */
  excludeTagIds?: number[]
}

/** Media that have every listed tag (AND). */
export const PINNED_MEDIA_JOIN = `INNER JOIN (
       SELECT mediaId AS pinnedMediaId
       FROM tagsInMedia
       WHERE tagId IN (:pinnedTagIds)
       GROUP BY mediaId
       HAVING COUNT(DISTINCT tagId) = :pinnedTagCount
     ) pinnedMedia ON pinnedMedia.pinnedMediaId = media.id`

/** Tags that co-occur on media having every listed tag, excluding those tags. */
export const COOCCURRING_TAG_CLAUSE = `AND tags.id IN (
       SELECT DISTINCT tim.tagId
       FROM tagsInMedia tim
       WHERE tim.mediaId IN (
         SELECT mediaId
         FROM tagsInMedia
         WHERE tagId IN (:pinnedTagIds)
         GROUP BY mediaId
         HAVING COUNT(DISTINCT tagId) = :pinnedTagCount
       )
     )
     AND tags.id NOT IN (:pinnedTagIds)`

export function normalizeSearchGlobalOptions(limitOrOptions?: unknown): SearchGlobalOptions {
  if (
    limitOrOptions != null
    && typeof limitOrOptions === 'object'
    && !Array.isArray(limitOrOptions)
  ) {
    return limitOrOptions as SearchGlobalOptions
  }

  return {limit: limitOrOptions}
}

export function normalizeMetaId(value: unknown): number | null {
  const metaId = Number(value)
  return Number.isFinite(metaId) ? metaId : null
}

export function normalizeSearchTagsOptions(
  limitOrOptions?: unknown,
  maybeOptions: SearchTagsByNameOptions = {},
): SearchTagsByNameOptions {
  if (
    limitOrOptions != null
    && typeof limitOrOptions === 'object'
    && !Array.isArray(limitOrOptions)
  ) {
    return limitOrOptions as SearchTagsByNameOptions
  }

  return {
    limit: limitOrOptions,
    metaId: maybeOptions.metaId,
    cooccurWithTagIds: maybeOptions.cooccurWithTagIds,
    excludeTagIds: maybeOptions.excludeTagIds,
  }
}

export function pinnedTagReplacements(tagIds: number[]): Record<string, unknown> {
  return {
    pinnedTagIds: tagIds,
    pinnedTagCount: tagIds.length,
  }
}

export function buildTagScopeClause(options: SearchTagsByNameOptions): {
  clause: string
  replacements: Record<string, unknown>
} {
  const metaId = normalizeMetaId(options.metaId)
  const cooccurWithTagIds = normalizeSearchTagIds(options.cooccurWithTagIds)
  const excludeTagIds = normalizeSearchTagIds(options.excludeTagIds)
  const replacements: Record<string, unknown> = {}
  const parts: string[] = []

  if (metaId != null) {
    parts.push('AND tags.metaId = :metaId')
    replacements.metaId = metaId
  }

  if (cooccurWithTagIds.length) {
    parts.push(COOCCURRING_TAG_CLAUSE)
    Object.assign(replacements, pinnedTagReplacements(cooccurWithTagIds))
  }

  if (excludeTagIds.length && !cooccurWithTagIds.length) {
    // Co-occurring clause already excludes pinned tags; only add when not co-filtering.
    parts.push('AND tags.id NOT IN (:excludeTagIds)')
    replacements.excludeTagIds = excludeTagIds
  }

  return {
    clause: parts.join('\n     '),
    replacements,
  }
}

export function enrichTagSearchRow(
  row: Record<string, unknown>,
  trimmed: string,
): GlobalSearchTagResult | null {
  const bookmark = row.bookmark == null ? null : String(row.bookmark)
  const resolved = resolveGlobalSearchTagMatch(
    String(row.name || ''),
    row.synonyms == null ? '' : String(row.synonyms),
    trimmed,
    bookmark,
  )

  if (!resolved.matched || !resolved.matchSource) return null

  return {
    id: Number(row.id),
    name: row.name == null ? null : String(row.name),
    metaId: row.metaId == null ? null : Number(row.metaId),
    synonyms: row.synonyms == null ? null : String(row.synonyms),
    matchSource: resolved.matchSource,
    matchedSynonyms: resolved.matchedSynonyms.length ? resolved.matchedSynonyms : undefined,
    matchedBookmark: resolved.matchedBookmark,
  }
}
