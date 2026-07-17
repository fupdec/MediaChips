import type { ApiDb } from '../types/db'
import { queryAll } from '../db/utils/rawQuery'
import {
  buildFtsMatchQuery,
  buildTagFtsMatchQuery,
  isFtsSearchAvailable,
  matchesGlobalSearchName,
  resolveGlobalSearchTagMatch,
  type GlobalSearchTagMatchSource,
  type GlobalSearchTagResult,
} from './ftsQuery'

const MAX_LIMIT = 200
const DEFAULT_LIMIT = 50

const MEDIA_SEARCH_SELECT = `SELECT media.id,
            media.name,
            media.mediaTypeId,
            media.path,
            COALESCE(videoMetadata.width, imageMetadata.width) AS width,
            COALESCE(videoMetadata.height, imageMetadata.height) AS height`

const MEDIA_BOOKMARK_SEARCH_SELECT = `${MEDIA_SEARCH_SELECT},
            media.bookmark`

const TAG_SEARCH_SELECT = `SELECT tags.id,
            tags.name,
            tags.metaId,
            tags.synonyms`

const TAG_BOOKMARK_SEARCH_SELECT = `${TAG_SEARCH_SELECT},
            tags.bookmark`

function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

function normalizeLimit(value: unknown): number {
  const limit = Number(value)
  if (!Number.isFinite(limit) || limit <= 0) return DEFAULT_LIMIT
  return Math.min(Math.floor(limit), MAX_LIMIT)
}

async function searchMediaByNameLike(db: ApiDb, trimmed: string, sqlLimit: number) {
  const pattern = `%${escapeLikePattern(trimmed)}%`

  return queryAll(db, `${MEDIA_SEARCH_SELECT}
     FROM media
              LEFT JOIN videoMetadata ON media.id = videoMetadata.mediaId
              LEFT JOIN imageMetadata ON media.id = imageMetadata.mediaId
     WHERE media.name LIKE :pattern ESCAPE '\\'
     LIMIT :limit`, {pattern, limit: sqlLimit})
}

async function searchMediaByNameFts(db: ApiDb, matchQuery: string, sqlLimit: number) {
  return queryAll(db, `${MEDIA_SEARCH_SELECT}
     FROM media_fts
              INNER JOIN media ON media.id = media_fts.rowid
              LEFT JOIN videoMetadata ON media.id = videoMetadata.mediaId
              LEFT JOIN imageMetadata ON media.id = imageMetadata.mediaId
     WHERE media_fts MATCH :match
     ORDER BY bm25(media_fts)
     LIMIT :limit`, {match: matchQuery, limit: sqlLimit})
}

async function searchMediaByName(db: ApiDb, query: string, limit: unknown) {
  const trimmed = String(query || '').trim()
  if (!trimmed) return []

  const sqlLimit = normalizeLimit(limit)
  const matchQuery = buildFtsMatchQuery(trimmed)

  let rows: Array<Record<string, unknown>> = []

  if (matchQuery && isFtsSearchAvailable(db.sqlite)) {
    try {
      rows = await searchMediaByNameFts(db, matchQuery, sqlLimit)
    } catch {
      // Fall back to LIKE when FTS query syntax is invalid.
    }
  }

  if (!rows.length) {
    rows = await searchMediaByNameLike(db, trimmed, sqlLimit)
  }

  return rows.filter((row) => matchesGlobalSearchName(String(row.name || ''), trimmed))
}

async function searchMediaByBookmark(db: ApiDb, query: string, limit: unknown) {
  const trimmed = String(query || '').trim()
  if (!trimmed) return []

  const sqlLimit = normalizeLimit(limit)
  const pattern = `%${escapeLikePattern(trimmed)}%`

  const rows = await queryAll(db, `${MEDIA_BOOKMARK_SEARCH_SELECT}
     FROM media
              LEFT JOIN videoMetadata ON media.id = videoMetadata.mediaId
              LEFT JOIN imageMetadata ON media.id = imageMetadata.mediaId
     WHERE media.bookmark LIKE :pattern ESCAPE '\\'
     LIMIT :limit`, {pattern, limit: sqlLimit})

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

export interface SearchTagsByNameOptions {
  limit?: unknown
  metaId?: number | null
}

function normalizeMetaId(value: unknown): number | null {
  const metaId = Number(value)
  return Number.isFinite(metaId) ? metaId : null
}

function normalizeSearchTagsOptions(
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
  }
}

async function searchTagsByNameLike(
  db: ApiDb,
  trimmed: string,
  sqlLimit: number,
  metaId: number | null,
) {
  const pattern = `%${escapeLikePattern(trimmed)}%`
  const metaClause = metaId == null ? '' : 'AND metaId = :metaId'
  const replacements: Record<string, unknown> = {pattern, limit: sqlLimit}
  if (metaId != null) replacements.metaId = metaId

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
  metaId: number | null,
) {
  const metaClause = metaId == null ? '' : 'AND tags.metaId = :metaId'
  const replacements: Record<string, unknown> = {match: matchQuery, limit: sqlLimit}
  if (metaId != null) replacements.metaId = metaId

  return queryAll(db, `${TAG_SEARCH_SELECT}
     FROM tags_fts
              INNER JOIN tags ON tags.id = tags_fts.rowid
     WHERE tags_fts MATCH :match
     ${metaClause}
     ORDER BY bm25(tags_fts)
     LIMIT :limit`, replacements)
}

function enrichTagSearchRow(
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

async function searchTagsByName(
  db: ApiDb,
  query: string,
  limitOrOptions?: unknown,
  maybeOptions?: SearchTagsByNameOptions,
): Promise<GlobalSearchTagResult[]> {
  const trimmed = String(query || '').trim()
  if (!trimmed) return []

  const options = normalizeSearchTagsOptions(limitOrOptions, maybeOptions)
  const sqlLimit = normalizeLimit(options.limit)
  const metaId = normalizeMetaId(options.metaId)
  const matchQuery = buildTagFtsMatchQuery(trimmed)

  let rows: Array<Record<string, unknown>> = []

  if (matchQuery && isFtsSearchAvailable(db.sqlite)) {
    try {
      rows = await searchTagsByNameFts(db, matchQuery, sqlLimit, metaId)
    } catch {
      // Fall back to LIKE when FTS query syntax is invalid.
    }
  }

  if (!rows.length) {
    rows = await searchTagsByNameLike(db, trimmed, sqlLimit, metaId)
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
  const sqlLimit = normalizeLimit(options.limit)
  const metaId = normalizeMetaId(options.metaId)
  const pattern = `%${escapeLikePattern(trimmed)}%`
  const metaClause = metaId == null ? '' : 'AND metaId = :metaId'
  const replacements: Record<string, unknown> = {pattern, limit: sqlLimit}
  if (metaId != null) replacements.metaId = metaId

  const rows = await queryAll(db, `${TAG_BOOKMARK_SEARCH_SELECT}
     FROM tags
     WHERE bookmark LIKE :pattern ESCAPE '\\'
     ${metaClause}
     LIMIT :limit`, replacements)

  return rows
    .map((row) => enrichTagSearchRow(row, trimmed))
    .filter((row): row is NonNullable<typeof row> => row != null)
}

function combineTagMatchSources(
  a: GlobalSearchTagMatchSource | undefined,
  b: GlobalSearchTagMatchSource | undefined,
): GlobalSearchTagMatchSource {
  if (!a) return b || 'name'
  if (!b) return a
  if (a === b) return a
  return 'both'
}

function mergeTagSearchRows(
  primary: GlobalSearchTagResult[],
  secondary: GlobalSearchTagResult[],
  limit: unknown,
): GlobalSearchTagResult[] {
  const sqlLimit = normalizeLimit(limit)
  const merged: GlobalSearchTagResult[] = []
  const byId = new Map<number, GlobalSearchTagResult>()

  for (const row of primary) {
    if (byId.has(row.id)) continue
    const next = {...row}
    byId.set(row.id, next)
    merged.push(next)
    if (merged.length >= sqlLimit) return merged
  }

  for (const row of secondary) {
    const existing = byId.get(row.id)
    if (existing) {
      existing.matchSource = combineTagMatchSources(existing.matchSource, row.matchSource)
      if (row.matchedSynonyms?.length) {
        const synonymSet = new Set([
          ...(existing.matchedSynonyms || []),
          ...row.matchedSynonyms,
        ])
        existing.matchedSynonyms = [...synonymSet]
      }
      if (row.matchedBookmark) {
        existing.matchedBookmark = row.matchedBookmark
      }
      continue
    }

    if (merged.length >= sqlLimit) break
    const next = {...row}
    byId.set(row.id, next)
    merged.push(next)
  }

  return merged
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
) {
  const uniqueTags = [...new Map(
    tags
      .map((tag) => [Number(tag.id), tag] as const)
      .filter(([id]) => Number.isFinite(id)),
  ).values()]
  if (!uniqueTags.length) return []

  const sqlLimit = normalizeLimit(limit)
  const tagIds = uniqueTags.map((tag) => Number(tag.id))
  const tagById = new Map(
    uniqueTags.map((tag) => [Number(tag.id), tag]),
  )

  const rows = await queryAll(db, `${MEDIA_SEARCH_SELECT},
            GROUP_CONCAT(DISTINCT tagsInMedia.tagId) AS matchedTagIds
     FROM media
              INNER JOIN tagsInMedia ON tagsInMedia.mediaId = media.id
              LEFT JOIN videoMetadata ON media.id = videoMetadata.mediaId
              LEFT JOIN imageMetadata ON media.id = imageMetadata.mediaId
     WHERE tagsInMedia.tagId IN (:tagIds)
     GROUP BY media.id
     LIMIT :limit`, {tagIds, limit: sqlLimit})

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

type MediaSearchMatchSource = 'name' | 'tag' | 'bookmark' | 'both'

function combineMediaMatchSources(
  a: MediaSearchMatchSource | undefined,
  b: MediaSearchMatchSource | undefined,
): MediaSearchMatchSource {
  if (!a) return b || 'name'
  if (!b) return a
  if (a === b) return a
  return 'both'
}

function mergeMediaSearchRows(
  primary: Array<Record<string, unknown>>,
  secondary: Array<Record<string, unknown>>,
  limit: unknown,
) {
  const sqlLimit = normalizeLimit(limit)
  const merged: Array<Record<string, unknown>> = []
  const byId = new Map<number, Record<string, unknown>>()

  for (const row of primary) {
    const id = Number(row.id)
    if (!Number.isFinite(id) || byId.has(id)) continue
    const next = {
      ...row,
      matchSource: (row.matchSource as MediaSearchMatchSource | undefined) || 'name',
    }
    byId.set(id, next)
    merged.push(next)
    if (merged.length >= sqlLimit) return merged
  }

  for (const row of secondary) {
    const id = Number(row.id)
    if (!Number.isFinite(id)) continue

    const existing = byId.get(id)
    if (existing) {
      const existingTags = Array.isArray(existing.matchedTags)
        ? existing.matchedTags as Array<{id: number; name: string}>
        : []
      const nextTags = Array.isArray(row.matchedTags)
        ? row.matchedTags as Array<{id: number; name: string}>
        : []
      const tagById = new Map<number, {id: number; name: string}>()
      for (const tag of [...existingTags, ...nextTags]) {
        tagById.set(Number(tag.id), tag)
      }
      existing.matchedTags = [...tagById.values()]
      existing.matchSource = combineMediaMatchSources(
        existing.matchSource as MediaSearchMatchSource | undefined,
        (row.matchSource as MediaSearchMatchSource | undefined)
          || (nextTags.length ? 'tag' : undefined),
      )
      if (typeof row.matchedBookmark === 'string' && row.matchedBookmark) {
        existing.matchedBookmark = row.matchedBookmark
      }
      continue
    }

    if (merged.length >= sqlLimit) break
    const next = {
      ...row,
      matchSource: (row.matchSource as MediaSearchMatchSource | undefined) || 'tag',
    }
    byId.set(id, next)
    merged.push(next)
  }

  return merged
}

async function searchGlobal(db: ApiDb, query: string, limit: unknown) {
  const [mediaByName, mediaByBookmark, tagsByName, tagsByBookmark] = await Promise.all([
    searchMediaByName(db, query, limit),
    searchMediaByBookmark(db, query, limit),
    searchTagsByName(db, query, {limit}),
    searchTagsByBookmark(db, query, {limit}),
  ])

  const tags = mergeTagSearchRows(tagsByName, tagsByBookmark, limit)
  const mediaByTags = await searchMediaByTagIds(db, tags, limit)
  const media = mergeMediaSearchRows(
    mergeMediaSearchRows(mediaByName, mediaByBookmark, limit),
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
  searchMediaByTagIds,
  searchTagsByName,
  searchTagsByBookmark,
  searchGlobal,
  MAX_LIMIT,
  DEFAULT_LIMIT,
}
