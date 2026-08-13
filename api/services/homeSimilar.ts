import type {ApiDb, AnyRecord} from '../types/db'
import {queryAll, queryGet} from '../db/utils/rawQuery'
import {
  CLIP_EMBEDDING_INDEX_KEY,
  findSimilarByClip,
} from './mediaClipEmbeddings'
import {loadMediaBasicsByIds} from './mediaItemsLoader'
import {mergeMediaSimilarityLists} from './mediaSimilarityRanking'
import {diversifyIdsBySeriesKey, mediaSeriesKey} from './mediaSeriesDiversity'
import {findSimilarByTags} from './mediaTagSimilarity'

export type HomeSimilarSeedReason = 'viewed' | 'favorite' | 'any'

export type HomeSimilarSeed = {
  id: number
  name?: string | null
  basename?: string | null
  path?: string | null
  mediaTypeId?: number | null
  reason: HomeSimilarSeedReason
}

export type HomeSimilarResult = {
  seed: HomeSimilarSeed | null
  seedItem: AnyRecord | null
  items: AnyRecord[]
}

const SEED_CANDIDATE_LIMIT = 24
/** Over-fetch each signal so RRF has room to promote tag/clip overlaps. */
const SIGNAL_FETCH_MULTIPLIER = 3
const CLIP_SIGNAL_WEIGHT = 1
const TAG_SIGNAL_WEIGHT = 0.95

function asNullableString(value: unknown): string | null {
  if (value == null || value === '') return null
  return String(value)
}

function mapSeedRow(row: AnyRecord, reason: HomeSimilarSeedReason = 'any'): HomeSimilarSeed {
  return {
    id: Number(row.id),
    name: asNullableString(row.name),
    basename: asNullableString(row.basename),
    path: asNullableString(row.path),
    mediaTypeId: row.mediaTypeId == null ? null : Number(row.mediaTypeId),
    reason,
  }
}

/** Prefer recently viewed seeds; fall back to favorites, then any indexed media. */
export function chooseHomeSimilarSeedId(
  candidateIds: number[],
  random: () => number = Math.random,
): number | null {
  const ids = candidateIds
    .map(Number)
    .filter((id) => Number.isFinite(id) && id > 0)
  if (!ids.length) return null
  const index = Math.min(ids.length - 1, Math.floor(random() * ids.length))
  return ids[index] ?? null
}

/** Shuffle copy so we can try several seeds until one yields neighbors. */
export function shuffleHomeSimilarSeeds<T>(
  items: T[],
  random: () => number = Math.random,
): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

/** True random sample of media that can drive CLIP and/or tag similarity. */
function loadRandomSeedCandidates(db: ApiDb, limit = SEED_CANDIDATE_LIMIT): HomeSimilarSeed[] {
  const rows = queryAll(db, `
    SELECT media.id, media.name, media.basename, media.path, media.mediaTypeId
    FROM media
    WHERE (
      EXISTS (
        SELECT 1 FROM mediaClipEmbeddings e
        WHERE e.mediaId = media.id AND e.model = :model
      )
      OR EXISTS (
        SELECT 1 FROM tagsInMedia t WHERE t.mediaId = media.id
      )
    )
    ORDER BY RANDOM()
    LIMIT :limit
  `, {
    model: CLIP_EMBEDDING_INDEX_KEY,
    limit,
  })
  return rows.map((row) => mapSeedRow(row, 'any'))
}

function libraryHasSimilarSignals(db: ApiDb): boolean {
  const indexed = queryGet<{count?: number}>(db, `
    SELECT COUNT(*) AS count
    FROM mediaClipEmbeddings
    WHERE model = :model
  `, {model: CLIP_EMBEDDING_INDEX_KEY})
  if (Number(indexed?.count) > 0) return true

  const tagged = queryGet<{ok?: number}>(db, `
    SELECT 1 AS ok
    FROM tagsInMedia
    LIMIT 1
  `)
  return Number(tagged?.ok) === 1
}

function toHomeItem(row: AnyRecord, extra: Record<string, unknown> = {}) {
  return {
    ...row,
    tags: [],
    values: [],
    key: String(row.id),
    ...extra,
  }
}

async function buildSimilarForSeed(
  db: ApiDb,
  seed: HomeSimilarSeed,
  limit: number,
): Promise<HomeSimilarResult | null> {
  const fetchLimit = Math.min(limit * SIGNAL_FETCH_MULTIPLIER + 1, 48)
  const hasClipRow = queryGet<{mediaId?: number}>(db, `
    SELECT mediaId
    FROM mediaClipEmbeddings
    WHERE mediaId = :mediaId AND model = :model
    LIMIT 1
  `, {mediaId: seed.id, model: CLIP_EMBEDDING_INDEX_KEY})

  // Do not on-demand-encode CLIP for home samples — tag-only seeds must stay cheap.
  const [clip, tags] = await Promise.all([
    hasClipRow
      ? findSimilarByClip(db, seed.id, {limit: fetchLimit})
      : Promise.resolve({
          hasEmbedding: false,
          hits: [] as Array<{id: number; score: number}>,
          ids: [] as number[],
        }),
    Promise.resolve(findSimilarByTags(db, seed.id, {limit: fetchLimit, minShared: 1})),
  ])

  // Either CLIP neighbors or shared-tag neighbors are enough.
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
  if (!lists.length) return null

  // Over-fetch so series collapse (14761_001…005) still fills the row.
  const ranked = mergeMediaSimilarityLists(lists, {
    limit: Math.min(Math.max(limit * 5, 24), 80),
    excludeIds: [seed.id],
  })
  if (!ranked.length) return null

  const rankedIds = ranked.map((hit) => hit.id)
  const rows = await loadMediaBasicsByIds(db, [seed.id, ...rankedIds])
  const byId = new Map(rows.map((row: AnyRecord) => [Number(row.id), row]))
  const scoreById = new Map(ranked.map((hit) => [hit.id, hit]))

  const seedRow = byId.get(seed.id)
  if (seedRow) {
    seed.name = asNullableString(seedRow.name) ?? seed.name
    seed.basename = asNullableString(seedRow.basename) ?? seed.basename
    seed.path = asNullableString(seedRow.path) ?? seed.path
    seed.mediaTypeId = seedRow.mediaTypeId == null
      ? seed.mediaTypeId
      : Number(seedRow.mediaTypeId)
  }

  const neighborIds = diversifyIdsBySeriesKey(rankedIds, byId, {
    limit,
    reservedKeys: [mediaSeriesKey(seedRow || seed)],
  })
  if (!neighborIds.length) return null

  const seedItem = seedRow ? toHomeItem(seedRow, {isSeed: true}) : null
  const items = neighborIds
    .map((id) => {
      const row = byId.get(id)
      if (!row) return null
      const hit = scoreById.get(id)
      return toHomeItem(row, {
        similarity: hit
          ? {
              score: hit.score,
              signals: hit.signals,
            }
          : undefined,
      })
    })
    .filter(Boolean) as AnyRecord[]

  if (!items.length) return null
  return {seed, seedItem, items}
}

export async function getHomeSimilar(
  db: ApiDb,
  options: {limit?: number; random?: () => number} = {},
): Promise<HomeSimilarResult> {
  const limit = Math.min(Math.max(Number(options.limit) || 12, 1), 24)
  if (!libraryHasSimilarSignals(db)) {
    return {seed: null, seedItem: null, items: []}
  }

  // Completely random eligible seeds (CLIP and/or tagged) — not recent-view biased.
  const candidates = loadRandomSeedCandidates(db, SEED_CANDIDATE_LIMIT)
  for (const candidate of candidates) {
    const result = await buildSimilarForSeed(db, candidate, limit)
    if (result) return result
  }

  return {seed: null, seedItem: null, items: []}
}
