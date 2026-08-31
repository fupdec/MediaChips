import type {ApiDb, AnyRecord} from '../types/db'
import {queryAll, queryGet} from '../db/utils/rawQuery'
import {MEDIA_NOT_IN_TRASH_SQL} from '../../shared/mediaTrash'
import {findCooccurringTags} from './tagCooccurrence'

export const TAG_SPOTLIGHT_TIP_IDS = [
  'no_media',
  'delete_unused',
  'add_to_media',
  'view',
  'fill_info',
  'add_synonyms',
  'add_bookmark',
  'rate',
  'explore_media',
  'add_related_tags',
] as const

export type TagSpotlightTipId = typeof TAG_SPOTLIGHT_TIP_IDS[number]

export type TagSpotlightTip = {
  id: TagSpotlightTipId
  priority: number
  action: 'edit' | 'open' | 'open_media' | 'delete'
}

export type TagSpotlightGap =
  | 'synonyms'
  | 'bookmark'
  | 'country'
  | 'rating'
  | 'color'
  | 'pinned_values'
  | 'nested_tags'

export type HomeTagSpotlightOptions = {
  excludeTagId?: number | null
  sampleMediaLimit?: number
  cooccurringLimit?: number
  /** Injected for tests. */
  random?: () => number
}

type TagCandidateRow = {
  id: number
  name: string
  synonyms: string | null
  rating: number
  favorite: number | boolean
  bookmark: string | null
  country: string | null
  color: string | null
  views: number | null
  viewedAt: string | null
  metaId: number
  createdAt: string
  updatedAt: string
  mediaCount: number
  valueCount: number
  nestedTagCount: number
  metaName: string | null
  metaIcon: string | null
  metaSynonyms: number | boolean
  metaBookmark: number | boolean
  metaCountry: number | boolean
  metaRating: number | boolean
  metaFavorite: number | boolean
  metaColor: number | boolean
  pinnedFieldCount: number
}

const MEDIA_HOME_SELECT = `SELECT media.id,
  media.path,
  media.name,
  media.basename,
  media.ext,
  media.mediaTypeId,
  media.filesize,
  media.rating,
  media.favorite,
  media.views,
  media.viewedAt,
  media.createdAt,
  videoMetadata.duration,
  videoMetadata.time,
  COALESCE(videoMetadata.width, imageMetadata.width) AS width,
  COALESCE(videoMetadata.height, imageMetadata.height) AS height`

const MEDIA_HOME_FROM = `FROM media
LEFT JOIN videoMetadata ON media.id = videoMetadata.mediaId
LEFT JOIN imageMetadata ON media.id = imageMetadata.mediaId`

function isEnabledFlag(value: unknown): boolean {
  return value === true || value === 1 || value === '1'
}

function isBlank(value: unknown): boolean {
  return value == null || String(value).trim() === ''
}

function mapSampleMedia(row: AnyRecord) {
  return {
    id: row.id,
    path: row.path,
    name: row.name,
    basename: row.basename,
    ext: row.ext,
    mediaTypeId: row.mediaTypeId,
    filesize: row.filesize,
    rating: row.rating,
    favorite: row.favorite,
    views: row.views,
    viewedAt: row.viewedAt,
    createdAt: row.createdAt,
    duration: row.duration,
    time: row.time,
    width: row.width,
    height: row.height,
    tags: [],
    values: [],
    key: String(row.id),
  }
}

/** Attention score — higher = more likely to be spotlighted. */
export function scoreTagSpotlightCandidate(row: {
  mediaCount: number
  views: number | null
  viewedAt: string | null
  synonyms: string | null
  bookmark: string | null
  country: string | null
  rating: number
  color: string | null
  valueCount: number
  nestedTagCount: number
  pinnedFieldCount: number
  metaSynonyms: number | boolean
  metaBookmark: number | boolean
  metaCountry: number | boolean
  metaRating: number | boolean
  metaColor: number | boolean
}): number {
  let score = 1

  if (row.mediaCount <= 0) score += 8
  if (!row.views || !row.viewedAt) score += 5
  if (isEnabledFlag(row.metaSynonyms) && isBlank(row.synonyms)) score += 3
  if (isEnabledFlag(row.metaBookmark) && isBlank(row.bookmark)) score += 3
  if (isEnabledFlag(row.metaCountry) && isBlank(row.country)) score += 2
  if (isEnabledFlag(row.metaRating) && !(Number(row.rating) > 0)) score += 2
  if (isEnabledFlag(row.metaColor) && isBlank(row.color)) score += 1
  if (row.pinnedFieldCount > 0 && row.valueCount < row.pinnedFieldCount) score += 3
  if (row.mediaCount > 0 && row.nestedTagCount <= 0) score += 1

  return score
}

export function buildTagSpotlightGaps(row: TagCandidateRow): TagSpotlightGap[] {
  const gaps: TagSpotlightGap[] = []

  if (isEnabledFlag(row.metaSynonyms) && isBlank(row.synonyms)) gaps.push('synonyms')
  if (isEnabledFlag(row.metaBookmark) && isBlank(row.bookmark)) gaps.push('bookmark')
  if (isEnabledFlag(row.metaCountry) && isBlank(row.country)) gaps.push('country')
  if (isEnabledFlag(row.metaRating) && !(Number(row.rating) > 0)) gaps.push('rating')
  if (isEnabledFlag(row.metaColor) && isBlank(row.color)) gaps.push('color')
  if (row.pinnedFieldCount > 0 && row.valueCount < Math.min(row.pinnedFieldCount, 1)) {
    gaps.push('pinned_values')
  } else if (row.pinnedFieldCount > 1 && row.valueCount < Math.ceil(row.pinnedFieldCount / 2)) {
    gaps.push('pinned_values')
  }
  if (row.mediaCount > 0 && row.nestedTagCount <= 0) gaps.push('nested_tags')

  return gaps
}

export function buildTagSpotlightTips(
  row: TagCandidateRow,
  gaps: TagSpotlightGap[],
): TagSpotlightTip[] {
  const tips: TagSpotlightTip[] = []

  if (row.mediaCount <= 0) {
    tips.push({id: 'no_media', priority: 10, action: 'open_media'})
    tips.push({id: 'add_to_media', priority: 20, action: 'open_media'})
    tips.push({id: 'delete_unused', priority: 30, action: 'delete'})
  }

  if (!row.views || !row.viewedAt) {
    tips.push({id: 'view', priority: 40, action: 'open'})
  }

  if (gaps.includes('synonyms')) {
    tips.push({id: 'add_synonyms', priority: 50, action: 'edit'})
  }
  if (gaps.includes('bookmark')) {
    tips.push({id: 'add_bookmark', priority: 55, action: 'edit'})
  }
  if (gaps.includes('rating')) {
    tips.push({id: 'rate', priority: 60, action: 'edit'})
  }
  if (
    gaps.includes('pinned_values')
    || gaps.includes('country')
    || gaps.includes('color')
    || gaps.includes('synonyms')
    || gaps.includes('bookmark')
    || gaps.includes('rating')
  ) {
    tips.push({id: 'fill_info', priority: 45, action: 'edit'})
  }

  if (row.mediaCount > 0) {
    tips.push({id: 'explore_media', priority: 80, action: 'open_media'})
  }
  if (gaps.includes('nested_tags') || row.mediaCount > 0) {
    tips.push({id: 'add_related_tags', priority: 90, action: 'edit'})
  }

  // Keep the most useful tips only (stable order by priority).
  const seen = new Set<string>()
  return tips
    .sort((a, b) => a.priority - b.priority)
    .filter((tip) => {
      if (seen.has(tip.id)) return false
      seen.add(tip.id)
      return true
    })
    .slice(0, 6)
}

function pickWeightedRandom<T>(
  items: T[],
  scoreOf: (item: T) => number,
  random: () => number,
): T | null {
  if (!items.length) return null
  let total = 0
  const weights = items.map((item) => {
    const weight = Math.max(1, scoreOf(item))
    total += weight
    return weight
  })
  let cursor = random() * total
  for (let i = 0; i < items.length; i += 1) {
    cursor -= weights[i]!
    if (cursor <= 0) return items[i]!
  }
  return items[items.length - 1]!
}

function loadCandidates(db: ApiDb, excludeTagId?: number | null): TagCandidateRow[] {
  const exclude = excludeTagId != null && Number.isFinite(excludeTagId) && excludeTagId > 0
    ? Number(excludeTagId)
    : null

  return queryAll<TagCandidateRow>(db, `
    SELECT
      tags.id AS id,
      tags.name AS name,
      tags.synonyms AS synonyms,
      tags.rating AS rating,
      tags.favorite AS favorite,
      tags.bookmark AS bookmark,
      tags.country AS country,
      tags.color AS color,
      tags.views AS views,
      tags.viewedAt AS viewedAt,
      tags.metaId AS metaId,
      tags.createdAt AS createdAt,
      tags.updatedAt AS updatedAt,
      meta.name AS metaName,
      meta.icon AS metaIcon,
      meta.synonyms AS metaSynonyms,
      meta.bookmark AS metaBookmark,
      meta.country AS metaCountry,
      meta.rating AS metaRating,
      meta.favorite AS metaFavorite,
      meta.color AS metaColor,
      (
        SELECT COUNT(*)
        FROM tagsInMedia tim
        INNER JOIN media ON media.id = tim.mediaId
        WHERE tim.tagId = tags.id
          AND ${MEDIA_NOT_IN_TRASH_SQL}
      ) AS mediaCount,
      (
        SELECT COUNT(*)
        FROM valuesInTags vit
        WHERE vit.tagId = tags.id
          AND vit.value IS NOT NULL
          AND TRIM(vit.value) != ''
      ) AS valueCount,
      (
        SELECT COUNT(*)
        FROM tagsInTags tit
        WHERE tit.parentTagId = tags.id
      ) AS nestedTagCount,
      (
        SELECT COUNT(*)
        FROM pinnedMetas pm
        WHERE pm.pinnedMetaId = tags.metaId
          AND COALESCE(pm.show, 1) = 1
      ) AS pinnedFieldCount
    FROM tags
    INNER JOIN meta ON meta.id = tags.metaId
    WHERE tags.metaId IS NOT NULL
      AND COALESCE(meta.hidden, 0) = 0
      AND meta.type = 'array'
      ${exclude != null ? 'AND tags.id != :excludeTagId' : ''}
  `, exclude != null ? {excludeTagId: exclude} : {})
}

function loadSampleMedia(db: ApiDb, tagId: number, limit: number) {
  const rows = queryAll(db, `${MEDIA_HOME_SELECT}
     ${MEDIA_HOME_FROM}
     INNER JOIN tagsInMedia ON tagsInMedia.mediaId = media.id
     WHERE tagsInMedia.tagId = :tagId
       AND ${MEDIA_NOT_IN_TRASH_SQL}
     ORDER BY (media.viewedAt IS NULL), media.viewedAt DESC, media.createdAt DESC, media.id DESC
     LIMIT :limit`, {tagId, limit})
  return rows.map(mapSampleMedia)
}

function loadTagValues(db: ApiDb, tagId: number) {
  return queryAll<{value: string; metaId: number}>(db, `
    SELECT value, metaId
    FROM valuesInTags
    WHERE tagId = :tagId
      AND value IS NOT NULL
      AND TRIM(value) != ''
  `, {tagId})
}

function loadNestedTags(db: ApiDb, tagId: number) {
  return queryAll<{tagId: number; metaId: number; name: string; color: string | null}>(db, `
    SELECT
      tags.id AS tagId,
      tagsInTags.metaId AS metaId,
      tags.name AS name,
      tags.color AS color
    FROM tagsInTags
    INNER JOIN tags ON tags.id = tagsInTags.tagId
    WHERE tagsInTags.parentTagId = :tagId
    ORDER BY tags.name COLLATE NOCASE ASC
    LIMIT 12
  `, {tagId})
}

/**
 * Home “tag spotlight”: one random-ish tag that needs attention,
 * with profile gaps, sample media, related tags and actionable tips.
 */
export function getHomeTagSpotlight(
  db: ApiDb,
  options: HomeTagSpotlightOptions = {},
) {
  const random = options.random ?? Math.random
  const sampleMediaLimit = Math.min(Math.max(Number(options.sampleMediaLimit) || 6, 1), 12)
  const cooccurringLimit = Math.min(Math.max(Number(options.cooccurringLimit) || 8, 1), 16)

  const candidates = loadCandidates(db, options.excludeTagId)
  if (!candidates.length) {
    // If exclude filtered everything out, retry without exclude.
    if (options.excludeTagId) {
      return getHomeTagSpotlight(db, {...options, excludeTagId: null})
    }
    return {tag: null}
  }

  const picked = pickWeightedRandom(
    candidates,
    (row) => scoreTagSpotlightCandidate(row),
    random,
  )
  if (!picked) return {tag: null}

  const gaps = buildTagSpotlightGaps(picked)
  const tips = buildTagSpotlightTips(picked, gaps)
  const sampleMedia = picked.mediaCount > 0
    ? loadSampleMedia(db, picked.id, sampleMediaLimit)
    : []
  const cooccurring = findCooccurringTags(db, picked.id)
    .slice(0, cooccurringLimit)
  const values = loadTagValues(db, picked.id)
  const nestedTags = loadNestedTags(db, picked.id)

  const totalTags = queryGet<{count: number}>(db, `
    SELECT COUNT(*) AS count
    FROM tags
    INNER JOIN meta ON meta.id = tags.metaId
    WHERE tags.metaId IS NOT NULL
      AND COALESCE(meta.hidden, 0) = 0
      AND meta.type = 'array'
  `)

  return {
    tag: {
      id: picked.id,
      name: picked.name,
      synonyms: picked.synonyms,
      rating: Number(picked.rating) || 0,
      favorite: isEnabledFlag(picked.favorite),
      bookmark: picked.bookmark,
      country: picked.country,
      color: picked.color,
      views: Number(picked.views) || 0,
      viewedAt: picked.viewedAt,
      metaId: picked.metaId,
      createdAt: picked.createdAt,
      updatedAt: picked.updatedAt,
      values,
      tags: nestedTags,
    },
    meta: {
      id: picked.metaId,
      name: picked.metaName,
      icon: picked.metaIcon,
      synonyms: isEnabledFlag(picked.metaSynonyms),
      bookmark: isEnabledFlag(picked.metaBookmark),
      country: isEnabledFlag(picked.metaCountry),
      rating: isEnabledFlag(picked.metaRating),
      favorite: isEnabledFlag(picked.metaFavorite),
      color: isEnabledFlag(picked.metaColor),
      type: 'array',
    },
    mediaCount: Number(picked.mediaCount) || 0,
    sampleMedia,
    cooccurring,
    gaps,
    tips,
    attentionScore: scoreTagSpotlightCandidate(picked),
    totalTags: Number(totalTags?.count) || candidates.length,
  }
}
