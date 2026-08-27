import type {ApiDb, AnyRecord} from '../types/db'
import {queryGet} from '../db/utils/rawQuery'
import {
  CLIP_EMBEDDING_INDEX_KEY,
  findSimilarByClip,
} from './mediaClipEmbeddings'
import {loadMediaBasicsByIds} from './mediaItemsLoader'
import {
  mergeMediaSimilarityLists,
  type MediaSimilarityHit,
} from './mediaSimilarityRanking'
import {diversifyIdsBySeriesKey, mediaSeriesKey} from './mediaSeriesDiversity'
import {findSimilarByTags} from './mediaTagSimilarity'

const SIGNAL_FETCH_MULTIPLIER = 3
const CLIP_SIGNAL_WEIGHT = 1
const TAG_SIGNAL_WEIGHT = 0.95
const DEFAULT_LIMIT = 48
/** Drop fused RRF hits below this fraction of the top score. */
const DEFAULT_MIN_SCORE_RATIO = 0.45

export type FindSimilarHybridOptions = {
  /** Max neighbors (seed is prepended separately onto `ids`). */
  limit?: number
  /**
   * Context-menu / wall: encode missing CLIP for the seed (default true).
   * Home widget: false — stay cheap for random tag-only seeds.
   */
  encodeSeedIfMissing?: boolean
  /** Extra media ids to exclude (e.g. Continue watching). Seed is always excluded. */
  excludeIds?: Iterable<number>
  /**
   * Drop weak fused scores below `top * ratio` (default 0.3).
   * Pass 0 to keep the full RRF tail.
   */
  minScoreRatio?: number
}

export type FindSimilarHybridResult = {
  seedId: number
  hasSignals: boolean
  hasEmbedding: boolean
  hasTags: boolean
  /** Seed first, then diversified neighbors (same shape as similarByClip/visual). */
  ids: number[]
  hits: MediaSimilarityHit[]
}

function clampLimit(limit?: number | null, fallback = DEFAULT_LIMIT): number {
  const n = Math.floor(Number(limit))
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(n, 200)
}

function seedHasClipEmbedding(db: ApiDb, mediaId: number): boolean {
  const row = queryGet<{mediaId?: number}>(db, `
    SELECT mediaId
    FROM mediaClipEmbeddings
    WHERE mediaId = :mediaId AND model = :model
    LIMIT 1
  `, {mediaId, model: CLIP_EMBEDDING_INDEX_KEY})
  return row?.mediaId != null
}

/**
 * Hybrid neighbors: CLIP + tag Jaccard via RRF, then one-per-filename-series.
 * Same ranking as the Home Similar widget.
 */
export async function findSimilarHybrid(
  db: ApiDb,
  seedId: number,
  options: FindSimilarHybridOptions = {},
): Promise<FindSimilarHybridResult> {
  const id = Number(seedId)
  if (!Number.isFinite(id) || id <= 0) {
    return {
      seedId: id,
      hasSignals: false,
      hasEmbedding: false,
      hasTags: false,
      ids: [],
      hits: [],
    }
  }

  const limit = clampLimit(options.limit)
  const encodeSeedIfMissing = options.encodeSeedIfMissing !== false
  const fetchLimit = Math.min(limit * SIGNAL_FETCH_MULTIPLIER + 1, 80)
  const minScoreRatio = options.minScoreRatio == null
    ? DEFAULT_MIN_SCORE_RATIO
    : Math.max(0, Number(options.minScoreRatio) || 0)

  const hasClipRow = seedHasClipEmbedding(db, id)
  const [clip, tags] = await Promise.all([
    (encodeSeedIfMissing || hasClipRow)
      ? findSimilarByClip(db, id, {limit: fetchLimit})
      : Promise.resolve({
          hasEmbedding: false,
          hits: [] as Array<{id: number; score: number; tileIndex?: number | null}>,
          ids: [] as number[],
        }),
    Promise.resolve(findSimilarByTags(db, id, {limit: fetchLimit, minShared: 1})),
  ])

  const lists = []
  if (clip.hasEmbedding && clip.hits?.length) {
    lists.push({
      signal: 'clip' as const,
      weight: CLIP_SIGNAL_WEIGHT,
      hits: clip.hits,
    })
  }
  if (tags.hasTags && tags.hits.length) {
    lists.push({
      signal: 'tags' as const,
      weight: TAG_SIGNAL_WEIGHT,
      hits: tags.hits,
    })
  }

  if (!lists.length) {
    return {
      seedId: id,
      hasSignals: false,
      hasEmbedding: Boolean(clip.hasEmbedding),
      hasTags: Boolean(tags.hasTags),
      ids: [],
      hits: [],
    }
  }

  const excludeIds = [
    id,
    ...[...(options.excludeIds || [])]
      .map(Number)
      .filter((excludeId) => Number.isFinite(excludeId) && excludeId > 0 && excludeId !== id),
  ]

  // Over-fetch so series collapse + weak-score trim still fill the requested limit.
  const ranked = mergeMediaSimilarityLists(lists, {
    limit: Math.min(Math.max(limit * 5, 24), 120),
    excludeIds,
    minScoreRatio: minScoreRatio > 0 ? minScoreRatio : undefined,
  })
  if (!ranked.length) {
    return {
      seedId: id,
      hasSignals: true,
      hasEmbedding: Boolean(clip.hasEmbedding),
      hasTags: Boolean(tags.hasTags),
      ids: [id],
      hits: [],
    }
  }

  const rankedIds = ranked.map((hit) => hit.id)
  const rows = await loadMediaBasicsByIds(db, [id, ...rankedIds])
  const byId = new Map(rows.map((row: AnyRecord) => [Number(row.id), row]))
  const scoreById = new Map(ranked.map((hit) => [hit.id, hit]))
  const seedRow = byId.get(id)

  const neighborIds = diversifyIdsBySeriesKey(rankedIds, byId, {
    limit,
    reservedKeys: [mediaSeriesKey(seedRow || {id})],
  })

  const hits = neighborIds
    .map((neighborId) => scoreById.get(neighborId))
    .filter(Boolean) as MediaSimilarityHit[]

  return {
    seedId: id,
    hasSignals: true,
    hasEmbedding: Boolean(clip.hasEmbedding),
    hasTags: Boolean(tags.hasTags),
    ids: [id, ...neighborIds],
    hits,
  }
}
