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
import { MEDIA_NOT_IN_TRASH_SQL } from '../../shared/mediaTrash'
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
       AND ${MEDIA_NOT_IN_TRASH_SQL}
     LIMIT :limit`, replacements)
}

async function searchMediaByNameFts(
  db: ApiDb,
  matchQuery: string,
  sqlLimit: number,
  pinnedTagIds: number[] = [],
  balanceMediaTypes = false,
) {
  const pinnedJoin = pinnedTagIds.length ? PINNED_MEDIA_JOIN : ''
  const replacements: Record<string, unknown> = {match: matchQuery, limit: sqlLimit}
  if (pinnedTagIds.length) Object.assign(replacements, pinnedTagReplacements(pinnedTagIds))

  if (balanceMediaTypes) {
    // Keep a single media type from filling the entire result list.
    return queryAll(db, `WITH scored AS MATERIALIZED (
         SELECT media.id, media.mediaTypeId, bm25(media_fts) AS score
         FROM media_fts
                  INNER JOIN media ON media.id = media_fts.rowid
                  ${pinnedJoin}
         WHERE media_fts MATCH :match
           AND ${MEDIA_NOT_IN_TRASH_SQL}
       ), ranked AS (
         SELECT id, score, ROW_NUMBER() OVER (PARTITION BY mediaTypeId ORDER BY score, id) AS position
         FROM scored
       ), matches AS (
         SELECT id, score, position
         FROM ranked
         ORDER BY position, score, id
         LIMIT :limit
       )
       ${MEDIA_SEARCH_SELECT}
       FROM matches
                INNER JOIN media ON media.id = matches.id
                LEFT JOIN videoMetadata ON media.id = videoMetadata.mediaId
                LEFT JOIN imageMetadata ON media.id = imageMetadata.mediaId
       ORDER BY matches.position, matches.score, matches.id`, replacements)
  }

  return queryAll(db, `${MEDIA_SEARCH_SELECT}
     FROM media_fts
              INNER JOIN media ON media.id = media_fts.rowid
              ${pinnedJoin}
              LEFT JOIN videoMetadata ON media.id = videoMetadata.mediaId
              LEFT JOIN imageMetadata ON media.id = imageMetadata.mediaId
     WHERE media_fts MATCH :match
       AND ${MEDIA_NOT_IN_TRASH_SQL}
     ORDER BY bm25(media_fts)
     LIMIT :limit`, replacements)
}

async function searchMediaByName(
  db: ApiDb,
  query: string,
  limit: unknown,
  pinnedTagIds: number[] = [],
  balanceMediaTypes = false,
) {
  const trimmed = String(query || '').trim()
  if (!trimmed) return []

  const sqlLimit = normalizeSearchLimit(limit)
  const matchQuery = buildFtsMatchQuery(trimmed)

  let rows: Array<Record<string, unknown>> = []

  if (matchQuery && isFtsSearchAvailable(db.sqlite)) {
    try {
      rows = await searchMediaByNameFts(db, matchQuery, sqlLimit, pinnedTagIds, balanceMediaTypes)
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
       AND ${MEDIA_NOT_IN_TRASH_SQL}
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
       AND ${MEDIA_NOT_IN_TRASH_SQL}
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

  const rows = await queryAll(db, `WITH matches AS (
       SELECT media.id, GROUP_CONCAT(DISTINCT tagsInMedia.tagId) AS matchedTagIds
       FROM media
                ${pinnedJoin}
                INNER JOIN tagsInMedia ON tagsInMedia.mediaId = media.id
       WHERE tagsInMedia.tagId IN (:tagIds)
         AND ${MEDIA_NOT_IN_TRASH_SQL}
       GROUP BY media.id
       ORDER BY media.id
       LIMIT :limit
     )
     ${MEDIA_SEARCH_SELECT}, matches.matchedTagIds
     FROM matches
              INNER JOIN media ON media.id = matches.id
              LEFT JOIN videoMetadata ON media.id = videoMetadata.mediaId
              LEFT JOIN imageMetadata ON media.id = imageMetadata.mediaId
     ORDER BY media.id`, replacements)

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
     WHERE ${MEDIA_NOT_IN_TRASH_SQL}
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

async function searchGlobalMediaPage(
  db: ApiDb,
  query: string,
  mediaTypeId: number,
  offset: number,
  options: SearchGlobalOptions & {countOnly?: boolean},
) {
  const trimmed = query.trim()
  const pinnedTagIds = normalizeSearchTagIds(options.tagIds)
  const limit = normalizeSearchLimit(options.limit)
  const match = buildFtsMatchQuery(trimmed)
  const tags = await searchTagsByName(db, trimmed, {excludeTagIds: pinnedTagIds})
  const tagIds = tags.map((tag) => tag.id)
  const pinnedJoin = pinnedTagIds.length ? PINNED_MEDIA_JOIN : ''
  const hasFts = Boolean(match && isFtsSearchAvailable(db.sqlite))
  const scored = hasFts
    ? `SELECT rowid AS id, ${options.countOnly ? 'NULL' : 'bm25(media_fts)'} AS score FROM media_fts WHERE media_fts MATCH :match`
    : 'SELECT NULL AS id, NULL AS score WHERE 0'
  const tagMatches = tagIds.length
    ? ', tagMatches AS MATERIALIZED (SELECT DISTINCT mediaId FROM tagsInMedia WHERE tagId IN (:tagIds))'
    : ''
  const tagJoin = tagIds.length ? 'LEFT JOIN tagMatches ON tagMatches.mediaId = media.id' : ''
  const tagMatch = tagIds.length ? 'tagMatches.mediaId IS NOT NULL' : '0'
  const nameMatch = trimmed ? "media.name LIKE :pattern ESCAPE '\\'" : '0'
  const candidates = `FROM media
                ${pinnedJoin}
                LEFT JOIN scored ON scored.id = media.id
                ${tagJoin}
       WHERE media.mediaTypeId = :mediaTypeId
         AND ${MEDIA_NOT_IN_TRASH_SQL}
         AND (${trimmed ? `scored.id IS NOT NULL OR ${nameMatch} OR ${tagMatch}` : pinnedTagIds.length ? '1' : '0'})`
  const replacements = {
    match, tagIds, mediaTypeId, offset, limit: limit + 1,
    pattern: `%${escapeLikePattern(trimmed)}%`,
    ...pinnedTagReplacements(pinnedTagIds),
  }
  if (options.countOnly) {
    const matches = queryAll<{name: string | null; byTag: number}>(db, `
      WITH scored AS MATERIALIZED (${scored})${tagMatches}
      SELECT media.name, ${tagMatch} AS byTag
      ${candidates}`, replacements)
    const total = matches.reduce((count, row) => count + Number(
      !trimmed || Boolean(row.byTag) || matchesGlobalSearchName(row.name, trimmed),
    ), 0)
    return {items: [], nextOffset: null, total}
  }

  const rows = queryAll<{id: number; name: string | null; byTag: number}>(db, `WITH scored AS MATERIALIZED (${scored})${tagMatches}, matches AS (
       SELECT media.id, scored.score, ${tagMatch} AS byTag
       ${candidates}
       ORDER BY scored.score IS NULL, scored.score, media.id
       LIMIT :limit OFFSET :offset
     )
     ${MEDIA_SEARCH_SELECT}, matches.byTag
     FROM matches
              INNER JOIN media ON media.id = matches.id
              LEFT JOIN videoMetadata ON media.id = videoMetadata.mediaId
              LEFT JOIN imageMetadata ON media.id = imageMetadata.mediaId
     ORDER BY matches.score IS NULL, matches.score, media.id`, replacements)
  return {
    items: rows.slice(0, limit).flatMap(({byTag, ...row}) => {
      const byName = trimmed && matchesGlobalSearchName(String(row.name || ''), trimmed)
      if (!byName && !byTag && trimmed) return []
      return [{...row, matchSource: byName ? (byTag ? 'both' : 'name') : 'tag'}]
    }),
    nextOffset: rows.length > limit ? offset + limit : null,
  }
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
  // Hot path = name/synonym FTS only. Bookmark + text-content LIKE scans are
  // optional (`deep`) — they dominate first-keystroke latency on huge DBs.
  const tagSearchOptions: SearchTagsByNameOptions = pinnedTagIds.length
    ? {limit, excludeTagIds: pinnedTagIds}
    : {limit}
  const deep = options.deep === true

  const [mediaByName, mediaByBookmark, mediaByContent, tagsByName, tagsByBookmark] = await Promise.all([
    searchMediaByName(db, trimmed, limit, pinnedTagIds, true),
    deep ? searchMediaByBookmark(db, trimmed, limit, pinnedTagIds) : Promise.resolve([]),
    deep ? searchMediaByContent(db, trimmed, limit, pinnedTagIds) : Promise.resolve([]),
    searchTagsByName(db, trimmed, tagSearchOptions),
    deep ? searchTagsByBookmark(db, trimmed, tagSearchOptions) : Promise.resolve([]),
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
  searchGlobalMediaPage,
  GLOBAL_SEARCH_MAX_LIMIT as MAX_LIMIT,
  GLOBAL_SEARCH_DEFAULT_LIMIT as DEFAULT_LIMIT,
}
