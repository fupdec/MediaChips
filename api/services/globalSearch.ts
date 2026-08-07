import type { ApiDb } from '../types/db'
import { queryAll } from '../db/utils/rawQuery'
import {
  buildFtsMatchQuery,
  buildTagFtsMatchQuery,
  isFtsSearchAvailable,
  matchesGlobalSearchName,
  type GlobalSearchTagMatchSource,
  type GlobalSearchTagResult,
} from './ftsQuery'
import {
  escapeLikePattern,
  mergeMediaSearchRows,
  mergeTagSearchRows,
  normalizeSearchLimit,
  normalizeSearchTagIds,
  GLOBAL_SEARCH_DEFAULT_LIMIT,
  GLOBAL_SEARCH_MAX_LIMIT,
} from './globalSearchMerge'
import {
  COOCCURRING_TAG_CLAUSE,
  PINNED_MEDIA_JOIN,
  buildTagScopeClause,
  enrichTagSearchRow,
  normalizeSearchGlobalOptions,
  normalizeSearchTagsOptions,
  pinnedTagReplacements,
  type SearchGlobalOptions,
  type SearchTagsByNameOptions,
} from './globalSearchScope'
import {buildContentSnippet} from './textContentIndex'

const MEDIA_SEARCH_SELECT = `SELECT media.id,
            media.name,
            media.mediaTypeId,
            media.path,
            COALESCE(videoMetadata.width, imageMetadata.width) AS width,
            COALESCE(videoMetadata.height, imageMetadata.height) AS height`

const MEDIA_BOOKMARK_SEARCH_SELECT = `${MEDIA_SEARCH_SELECT},
            media.bookmark`

const MEDIA_CONTENT_SEARCH_SELECT = `${MEDIA_SEARCH_SELECT},
            textContent.content AS textContentBody`

const TAG_SEARCH_SELECT = `SELECT tags.id,
            tags.name,
            tags.metaId,
            tags.synonyms`

const TAG_BOOKMARK_SEARCH_SELECT = `${TAG_SEARCH_SELECT},
            tags.bookmark`

export type {SearchGlobalOptions, SearchTagsByNameOptions}

async function searchMediaByNameLike(
  db: ApiDb,
  trimmed: string,
  sqlLimit: number,
  pinnedTagIds: number[] = [],
) {
  const pattern = `%${escapeLikePattern(trimmed)}%`
  const pinnedJoin = pinnedTagIds.length ? PINNED_MEDIA_JOIN : ''
  const replacements: Record<string, unknown> = {pattern, limit: sqlLimit}
  if (pinnedTagIds.length) Object.assign(replacements, pinnedTagReplacements(pinnedTagIds))

  return queryAll(db, `${MEDIA_SEARCH_SELECT}
     FROM media
              ${pinnedJoin}
              LEFT JOIN videoMetadata ON media.id = videoMetadata.mediaId
              LEFT JOIN imageMetadata ON media.id = imageMetadata.mediaId
     WHERE media.name LIKE :pattern ESCAPE '\\'
     LIMIT :limit`, replacements)
}

async function searchMediaByNameFts(
  db: ApiDb,
  matchQuery: string,
  sqlLimit: number,
  pinnedTagIds: number[] = [],
) {
  const pinnedJoin = pinnedTagIds.length ? PINNED_MEDIA_JOIN : ''
  const replacements: Record<string, unknown> = {match: matchQuery, limit: sqlLimit}
  if (pinnedTagIds.length) Object.assign(replacements, pinnedTagReplacements(pinnedTagIds))

  return queryAll(db, `${MEDIA_SEARCH_SELECT}
     FROM media_fts
              INNER JOIN media ON media.id = media_fts.rowid
              ${pinnedJoin}
              LEFT JOIN videoMetadata ON media.id = videoMetadata.mediaId
              LEFT JOIN imageMetadata ON media.id = imageMetadata.mediaId
     WHERE media_fts MATCH :match
     ORDER BY bm25(media_fts)
     LIMIT :limit`, replacements)
}

async function searchMediaByName(
  db: ApiDb,
  query: string,
  limit: unknown,
  pinnedTagIds: number[] = [],
) {
  const trimmed = String(query || '').trim()
  if (!trimmed) return []

  const sqlLimit = normalizeSearchLimit(limit)
  const matchQuery = buildFtsMatchQuery(trimmed)

  let rows: Array<Record<string, unknown>> = []

  if (matchQuery && isFtsSearchAvailable(db.sqlite)) {
    try {
      rows = await searchMediaByNameFts(db, matchQuery, sqlLimit, pinnedTagIds)
    } catch {
      // Fall back to LIKE when FTS query syntax is invalid.
    }
  }

  if (!rows.length) {
    rows = await searchMediaByNameLike(db, trimmed, sqlLimit, pinnedTagIds)
  }

  return rows.filter((row) => matchesGlobalSearchName(String(row.name || ''), trimmed))
}

async function searchMediaByBookmark(
  db: ApiDb,
  query: string,
  limit: unknown,
  pinnedTagIds: number[] = [],
) {
  const trimmed = String(query || '').trim()
  if (!trimmed) return []

  const sqlLimit = normalizeSearchLimit(limit)
  const pattern = `%${escapeLikePattern(trimmed)}%`
  const pinnedJoin = pinnedTagIds.length ? PINNED_MEDIA_JOIN : ''
  const replacements: Record<string, unknown> = {pattern, limit: sqlLimit}
  if (pinnedTagIds.length) Object.assign(replacements, pinnedTagReplacements(pinnedTagIds))

  const rows = await queryAll(db, `${MEDIA_BOOKMARK_SEARCH_SELECT}
     FROM media
              ${pinnedJoin}
              LEFT JOIN videoMetadata ON media.id = videoMetadata.mediaId
              LEFT JOIN imageMetadata ON media.id = imageMetadata.mediaId
     WHERE media.bookmark LIKE :pattern ESCAPE '\\'
     LIMIT :limit`, replacements)

  return rows
    .filter((row) => matchesGlobalSearchName(
      row.bookmark == null ? '' : String(row.bookmark),
      trimmed,
    ))
    .map((row) => {
      const bookmark = row.bookmark == null ? '' : String(row.bookmark)
      const {bookmark: _bookmark, ...mediaRow} = row
      return {
        ...mediaRow,
        matchSource: 'bookmark' as const,
        matchedBookmark: bookmark,
      }
    })
}

async function searchMediaByContent(
  db: ApiDb,
  query: string,
  limit: unknown,
  pinnedTagIds: number[] = [],
) {
  const trimmed = String(query || '').trim()
  if (!trimmed) return []

  const sqlLimit = normalizeSearchLimit(limit)
  const pattern = `%${escapeLikePattern(trimmed)}%`
  const pinnedJoin = pinnedTagIds.length ? PINNED_MEDIA_JOIN : ''
  const replacements: Record<string, unknown> = {pattern, limit: sqlLimit}
  if (pinnedTagIds.length) Object.assign(replacements, pinnedTagReplacements(pinnedTagIds))

  const rows = await queryAll(db, `${MEDIA_CONTENT_SEARCH_SELECT}
     FROM media
              ${pinnedJoin}
              LEFT JOIN videoMetadata ON media.id = videoMetadata.mediaId
              LEFT JOIN imageMetadata ON media.id = imageMetadata.mediaId
              INNER JOIN textContent ON media.id = textContent.mediaId
     WHERE textContent.content LIKE :pattern ESCAPE '\\'
     LIMIT :limit`, replacements)

  return rows
    .filter((row) => matchesGlobalSearchName(
      row.textContentBody == null ? '' : String(row.textContentBody),
      trimmed,
    ))
    .map((row) => {
      const body = row.textContentBody == null ? '' : String(row.textContentBody)
      const {textContentBody: _body, ...mediaRow} = row
      return {
        ...mediaRow,
        matchSource: 'content' as const,
        matchedContent: buildContentSnippet(body, trimmed),
      }
    })
}

async function searchTagsByNameLike(
  db: ApiDb,
  trimmed: string,
  sqlLimit: number,
  options: SearchTagsByNameOptions,
) {
  const pattern = `%${escapeLikePattern(trimmed)}%`
  const scope = buildTagScopeClause(options)
  const replacements: Record<string, unknown> = {
    pattern,
    limit: sqlLimit,
    ...scope.replacements,
  }

  // LIKE path uses unqualified metaId column when not joining FTS.
  const metaClause = scope.clause.replace(/tags\.metaId/g, 'metaId').replace(/tags\.id/g, 'id')

  return queryAll(db, `${TAG_SEARCH_SELECT}
     FROM tags
     WHERE (name LIKE :pattern ESCAPE '\\'
        OR synonyms LIKE :pattern ESCAPE '\\')
     ${metaClause}
     LIMIT :limit`, replacements)
}

async function searchTagsByNameFts(
  db: ApiDb,
  matchQuery: string,
  sqlLimit: number,
  options: SearchTagsByNameOptions,
) {
  const scope = buildTagScopeClause(options)
  const replacements: Record<string, unknown> = {
    match: matchQuery,
    limit: sqlLimit,
    ...scope.replacements,
  }

  return queryAll(db, `${TAG_SEARCH_SELECT}
     FROM tags_fts
              INNER JOIN tags ON tags.id = tags_fts.rowid
     WHERE tags_fts MATCH :match
     ${scope.clause}
     ORDER BY bm25(tags_fts)
     LIMIT :limit`, replacements)
}

async function searchTagsByName(
  db: ApiDb,
  query: string,
  limitOrOptions?: unknown,
  maybeOptions?: SearchTagsByNameOptions,
): Promise<GlobalSearchTagResult[]> {
  const trimmed = String(query || '').trim()
  if (!trimmed) return []

  const options = normalizeSearchTagsOptions(limitOrOptions, maybeOptions)
  const sqlLimit = normalizeSearchLimit(options.limit)
  const matchQuery = buildTagFtsMatchQuery(trimmed)

  let rows: Array<Record<string, unknown>> = []

  if (matchQuery && isFtsSearchAvailable(db.sqlite)) {
    try {
      rows = await searchTagsByNameFts(db, matchQuery, sqlLimit, options)
    } catch {
      // Fall back to LIKE when FTS query syntax is invalid.
    }
  }

  if (!rows.length) {
    rows = await searchTagsByNameLike(db, trimmed, sqlLimit, options)
  }

  return rows
    .map((row) => enrichTagSearchRow(row, trimmed))
    .filter((row): row is NonNullable<typeof row> => row != null)
}

async function searchTagsByBookmark(
  db: ApiDb,
  query: string,
  limitOrOptions?: unknown,
  maybeOptions?: SearchTagsByNameOptions,
): Promise<GlobalSearchTagResult[]> {
  const trimmed = String(query || '').trim()
  if (!trimmed) return []

  const options = normalizeSearchTagsOptions(limitOrOptions, maybeOptions)
  const sqlLimit = normalizeSearchLimit(options.limit)
  const pattern = `%${escapeLikePattern(trimmed)}%`
  const scope = buildTagScopeClause(options)
  const metaClause = scope.clause.replace(/tags\.metaId/g, 'metaId').replace(/tags\.id/g, 'id')
  const replacements: Record<string, unknown> = {
    pattern,
    limit: sqlLimit,
    ...scope.replacements,
  }

  const rows = await queryAll(db, `${TAG_BOOKMARK_SEARCH_SELECT}
     FROM tags
     WHERE bookmark LIKE :pattern ESCAPE '\\'
     ${metaClause}
     LIMIT :limit`, replacements)

  return rows
    .map((row) => enrichTagSearchRow(row, trimmed))
    .filter((row): row is NonNullable<typeof row> => row != null)
}

async function searchMediaByTagIds(
  db: ApiDb,
  tags: Array<{
    id: number
    name?: string | null
    metaId?: number | null
    matchSource?: GlobalSearchTagMatchSource
    matchedSynonyms?: string[]
    matchedBookmark?: string
  }>,
  limit: unknown,
  requireAllTagIds: number[] = [],
) {
  const uniqueTags = [...new Map(
    tags
      .map((tag) => [Number(tag.id), tag] as const)
      .filter(([id]) => Number.isFinite(id)),
  ).values()]
  if (!uniqueTags.length) return []

  const sqlLimit = normalizeSearchLimit(limit)
  const tagIds = uniqueTags.map((tag) => Number(tag.id))
  const tagById = new Map(
    uniqueTags.map((tag) => [Number(tag.id), tag]),
  )
  const pinnedJoin = requireAllTagIds.length ? PINNED_MEDIA_JOIN : ''
  const replacements: Record<string, unknown> = {tagIds, limit: sqlLimit}
  if (requireAllTagIds.length) {
    Object.assign(replacements, pinnedTagReplacements(requireAllTagIds))
  }

  const rows = await queryAll(db, `${MEDIA_SEARCH_SELECT},
            GROUP_CONCAT(DISTINCT tagsInMedia.tagId) AS matchedTagIds
     FROM media
              ${pinnedJoin}
              INNER JOIN tagsInMedia ON tagsInMedia.mediaId = media.id
              LEFT JOIN videoMetadata ON media.id = videoMetadata.mediaId
              LEFT JOIN imageMetadata ON media.id = imageMetadata.mediaId
     WHERE tagsInMedia.tagId IN (:tagIds)
     GROUP BY media.id
     LIMIT :limit`, replacements)

  return rows.map((row) => {
    const matchedTagIds = String(row.matchedTagIds || '')
      .split(',')
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id))

    const matchedTags = matchedTagIds
      .map((id) => {
        const tag = tagById.get(id)
        const name = tag?.name == null ? null : String(tag.name)
        if (name == null || name === '') return null
        return {
          id,
          name,
          metaId: tag?.metaId == null ? null : Number(tag.metaId),
          matchSource: tag?.matchSource,
          matchedSynonyms: tag?.matchedSynonyms?.length ? [...tag.matchedSynonyms] : undefined,
          matchedBookmark: tag?.matchedBookmark,
        }
      })
      .filter((tag) => tag != null)

    const {matchedTagIds: _matchedTagIds, ...mediaRow} = row
    return {
      ...mediaRow,
      matchSource: 'tag' as const,
      matchedTags,
    }
  })
}

async function loadPinnedTagSummaries(db: ApiDb, tagIds: number[]) {
  if (!tagIds.length) return []
  return queryAll(db, `${TAG_SEARCH_SELECT}
     FROM tags
     WHERE id IN (:tagIds)`, {tagIds})
}

async function searchMediaHavingAllTagIds(db: ApiDb, tagIds: number[], limit: unknown) {
  const sqlLimit = normalizeSearchLimit(limit)
  const pinnedTags = await loadPinnedTagSummaries(db, tagIds)
  const tagById = new Map(
    pinnedTags.map((tag) => [Number(tag.id), tag]),
  )

  const rows = await queryAll(db, `${MEDIA_SEARCH_SELECT}
     FROM media
              ${PINNED_MEDIA_JOIN}
              LEFT JOIN videoMetadata ON media.id = videoMetadata.mediaId
              LEFT JOIN imageMetadata ON media.id = imageMetadata.mediaId
     LIMIT :limit`, {
    ...pinnedTagReplacements(tagIds),
    limit: sqlLimit,
  })

  return rows.map((row) => {
    const matchedTags = tagIds
      .map((id) => {
        const tag = tagById.get(id)
        const name = tag?.name == null ? null : String(tag.name)
        if (name == null || name === '') return null
        return {
          id,
          name,
          metaId: tag?.metaId == null ? null : Number(tag.metaId),
          matchSource: 'name' as const,
        }
      })
      .filter((tag) => tag != null)

    return {
      ...row,
      matchSource: 'tag' as const,
      matchedTags,
    }
  })
}

async function searchCooccurringTags(
  db: ApiDb,
  tagIds: number[],
  limit: unknown,
): Promise<GlobalSearchTagResult[]> {
  const sqlLimit = normalizeSearchLimit(limit)
  const rows = await queryAll(db, `${TAG_SEARCH_SELECT}
     FROM tags
     WHERE 1 = 1
     ${COOCCURRING_TAG_CLAUSE.replace(/tags\.id/g, 'id')}
     LIMIT :limit`, {
    ...pinnedTagReplacements(tagIds),
    limit: sqlLimit,
  })

  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name == null ? null : String(row.name),
    metaId: row.metaId == null ? null : Number(row.metaId),
    synonyms: row.synonyms == null ? null : String(row.synonyms),
    matchSource: 'name' as const,
  }))
}

async function searchGlobal(db: ApiDb, query: string, limitOrOptions?: unknown) {
  const options = normalizeSearchGlobalOptions(limitOrOptions)
  const limit = options.limit
  const pinnedTagIds = normalizeSearchTagIds(options.tagIds)
  const trimmed = String(query || '').trim()

  if (!trimmed && !pinnedTagIds.length) {
    return {media: [], tags: []}
  }

  if (!trimmed && pinnedTagIds.length) {
    const [media, tags] = await Promise.all([
      searchMediaHavingAllTagIds(db, pinnedTagIds, limit),
      searchCooccurringTags(db, pinnedTagIds, limit),
    ])
    return {media, tags}
  }

  // With text query: tags are always global matches (for pinning more),
  // media are scoped to pinned tags when any are set.
  const tagSearchOptions: SearchTagsByNameOptions = pinnedTagIds.length
    ? {limit, excludeTagIds: pinnedTagIds}
    : {limit}

  const [mediaByName, mediaByBookmark, mediaByContent, tagsByName, tagsByBookmark] = await Promise.all([
    searchMediaByName(db, trimmed, limit, pinnedTagIds),
    searchMediaByBookmark(db, trimmed, limit, pinnedTagIds),
    searchMediaByContent(db, trimmed, limit, pinnedTagIds),
    searchTagsByName(db, trimmed, tagSearchOptions),
    searchTagsByBookmark(db, trimmed, tagSearchOptions),
  ])

  const tags = mergeTagSearchRows(tagsByName, tagsByBookmark, limit)
  const mediaByTags = await searchMediaByTagIds(db, tags, limit, pinnedTagIds)
  const media = mergeMediaSearchRows(
    mergeMediaSearchRows(
      mergeMediaSearchRows(mediaByName, mediaByBookmark, limit),
      mediaByContent,
      limit,
    ),
    mediaByTags,
    limit,
  )

  return {
    media,
    tags,
  }
}

export {
  searchMediaByName,
  searchMediaByBookmark,
  searchMediaByContent,
  searchMediaByTagIds,
  searchTagsByName,
  searchTagsByBookmark,
  searchGlobal,
  GLOBAL_SEARCH_MAX_LIMIT as MAX_LIMIT,
  GLOBAL_SEARCH_DEFAULT_LIMIT as DEFAULT_LIMIT,
}
