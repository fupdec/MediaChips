import type {ApiDb, AnyRecord} from '../types/db'
import {queryAll, queryGet} from '../db/utils/rawQuery'
import {getContinueWatching} from './homeMedia'
import {CLIP_EMBEDDING_INDEX_KEY} from './mediaClipEmbeddings'
import {loadMediaBasicsByIds} from './mediaItemsLoader'
import {parseGridTileIndex} from '../../shared/videoPreview'
import {findSimilarHybrid} from './mediaHybridSimilarity'

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
/**
 * Chance each attempt draws from recently viewed (else the random pool).
 * Must be per-slot, not a viewed prefix: first-success would otherwise
 * always pick a recently viewed original whenever those have neighbors.
 */
const VIEWED_SEED_BIAS = 0.4
/** Match the Home Continue row so Similar does not echo it. */
const CONTINUE_EXCLUDE_LIMIT = 12

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

function shuffleCopy<T>(items: T[], random: () => number): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

/**
 * Build try-order for seeds: each slot is viewed with probability
 * `viewedBias`, otherwise from the random pool (then leftovers).
 */
export function orderHomeSimilarSeeds(
  viewed: HomeSimilarSeed[],
  randomPool: HomeSimilarSeed[],
  options: {
    limit?: number
    viewedBias?: number
    random?: () => number
  } = {},
): HomeSimilarSeed[] {
  const limit = Math.max(0, Math.floor(Number(options.limit) || SEED_CANDIDATE_LIMIT))
  if (limit <= 0) return []

  const bias = Math.min(1, Math.max(0, Number(options.viewedBias ?? VIEWED_SEED_BIAS)))
  const random = options.random || Math.random
  const viewedShuffled = shuffleCopy(viewed, random)
  const randomShuffled = shuffleCopy(randomPool, random)

  const seen = new Set<number>()
  const out: HomeSimilarSeed[] = []
  let viewedIndex = 0
  let randomIndex = 0

  while (out.length < limit) {
    while (viewedIndex < viewedShuffled.length && seen.has(viewedShuffled[viewedIndex].id)) {
      viewedIndex += 1
    }
    while (randomIndex < randomShuffled.length && seen.has(randomShuffled[randomIndex].id)) {
      randomIndex += 1
    }
    const haveViewed = viewedIndex < viewedShuffled.length
    const haveRandom = randomIndex < randomShuffled.length
    if (!haveViewed && !haveRandom) break

    const takeViewed = haveViewed && (!haveRandom || random() < bias)
    const seed = takeViewed ? viewedShuffled[viewedIndex++] : randomShuffled[randomIndex++]
    if (!seed || seen.has(seed.id)) continue
    seen.add(seed.id)
    out.push(seed)
  }

  return out
}

const ELIGIBLE_SEED_WHERE = `
  (
    EXISTS (
      SELECT 1 FROM mediaClipEmbeddings e
      WHERE e.mediaId = media.id AND e.model = :model
    )
    OR EXISTS (
      SELECT 1 FROM tagsInMedia t WHERE t.mediaId = media.id
    )
  )
`

function loadViewedSeedCandidates(db: ApiDb, limit = SEED_CANDIDATE_LIMIT): HomeSimilarSeed[] {
  const rows = queryAll(db, `
    SELECT media.id, media.name, media.basename, media.path, media.mediaTypeId
    FROM media
    WHERE media.viewedAt IS NOT NULL
      AND media.viewedAt != ''
      AND ${ELIGIBLE_SEED_WHERE}
    ORDER BY media.viewedAt DESC
    LIMIT :limit
  `, {
    model: CLIP_EMBEDDING_INDEX_KEY,
    limit,
  })
  return rows.map((row) => mapSeedRow(row, 'viewed'))
}

/** Time allowed for the cheap id probes before falling back to the full random scan. */
const PROBE_BUDGET_MS = 40

/** Exact but slow on big libraries: it scans and sorts every eligible row (about 200 ms at 185k files). */
function loadRandomSeedCandidatesByScan(db: ApiDb, limit: number): HomeSimilarSeed[] {
  const rows = queryAll(db, `
    SELECT media.id, media.name, media.basename, media.path, media.mediaTypeId
    FROM media
    WHERE ${ELIGIBLE_SEED_WHERE}
    ORDER BY RANDOM()
    LIMIT :limit
  `, {
    model: CLIP_EMBEDDING_INDEX_KEY,
    limit,
  })
  return rows.map((row) => mapSeedRow(row, 'any'))
}

/**
 * Random sample of media that can drive CLIP and/or tag similarity.
 * Probes random id positions (each probe only walks the primary key from that point to the
 * first eligible row) instead of sorting the whole table; small or sparse libraries, where the
 * probes cannot fill the sample inside the time budget, use the exact scan.
 */
function loadRandomSeedCandidates(
  db: ApiDb,
  limit = SEED_CANDIDATE_LIMIT,
  random: () => number = Math.random,
): HomeSimilarSeed[] {
  const range = queryGet<{minId?: number | null; maxId?: number | null}>(db, `
    SELECT MIN(id) AS minId, MAX(id) AS maxId FROM media
  `)
  const minId = Number(range?.minId)
  const maxId = Number(range?.maxId)
  if (!Number.isFinite(minId) || !Number.isFinite(maxId) || maxId < minId) return []

  const found = new Map<number, HomeSimilarSeed>()
  const startedAt = performance.now()
  for (let attempt = 0; attempt < limit * 3 && found.size < limit; attempt++) {
    if (performance.now() - startedAt > PROBE_BUDGET_MS) break
    const start = minId + Math.floor(random() * (maxId - minId + 1))
    const row = queryGet(db, `
      SELECT media.id, media.name, media.basename, media.path, media.mediaTypeId
      FROM media
      WHERE media.id >= :start AND ${ELIGIBLE_SEED_WHERE}
      ORDER BY media.id
      LIMIT 1
    `, {start, model: CLIP_EMBEDDING_INDEX_KEY})
    if (row) found.set(Number(row.id), mapSeedRow(row, 'any'))
  }

  return found.size >= limit
    ? [...found.values()]
    : loadRandomSeedCandidatesByScan(db, limit)
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
  excludeIds: number[],
): Promise<HomeSimilarResult | null> {
  // Do not on-demand-encode CLIP for home samples — tag-only seeds must stay cheap.
  const hybrid = await findSimilarHybrid(db, seed.id, {
    limit,
    encodeSeedIfMissing: false,
    excludeIds,
  })
  if (!hybrid.hasSignals || !hybrid.hits.length) return null

  const neighborIds = hybrid.hits.map((hit) => hit.id)
  const rows = await loadMediaBasicsByIds(db, [seed.id, ...neighborIds])
  const byId = new Map(rows.map((row: AnyRecord) => [Number(row.id), row]))
  const scoreById = new Map(hybrid.hits.map((hit) => [hit.id, hit]))

  const seedRow = byId.get(seed.id)
  if (seedRow) {
    seed.name = asNullableString(seedRow.name) ?? seed.name
    seed.basename = asNullableString(seedRow.basename) ?? seed.basename
    seed.path = asNullableString(seedRow.path) ?? seed.path
    seed.mediaTypeId = seedRow.mediaTypeId == null
      ? seed.mediaTypeId
      : Number(seedRow.mediaTypeId)
  }

  const seedItem = seedRow ? toHomeItem(seedRow, {isSeed: true}) : null
  const items = neighborIds
    .map((id) => {
      const row = byId.get(id)
      if (!row) return null
      const hit = scoreById.get(id)
      const tileIndex = parseGridTileIndex(hit?.tileIndex)
      return toHomeItem(row, {
        ...(tileIndex != null ? {semanticTileIndex: tileIndex} : {}),
        similarity: hit
          ? {
              score: hit.score,
              signals: hit.signals,
              ...(tileIndex != null ? {tileIndex} : {}),
            }
          : undefined,
      })
    })
    .filter(Boolean) as AnyRecord[]

  if (!items.length) return null
  return {seed, seedItem, items}
}

/** The widget is a "discover something" row, so a few minutes of reuse is fine and saves a heavy search. */
const RESULT_CACHE_TTL_MS = 3 * 60_000

type CachedResult = {expiresAt: number; promise: Promise<HomeSimilarResult>}

let resultCache = new WeakMap<object, Map<string, CachedResult>>()

export function clearHomeSimilarCache(): void {
  resultCache = new WeakMap()
}

/**
 * Cached for a few minutes per library and request, and concurrent calls share one search.
 * Calls with an injected `random` (tests) are never cached.
 */
export async function getHomeSimilar(
  db: ApiDb,
  options: {limit?: number; random?: () => number; excludeSeedId?: number | null} = {},
): Promise<HomeSimilarResult> {
  if (options.random) return computeHomeSimilar(db, options)

  const limit = Math.min(Math.max(Number(options.limit) || 12, 1), 24)
  const excludeSeedId = Number(options.excludeSeedId)
  const key = `${limit}:${Number.isFinite(excludeSeedId) && excludeSeedId > 0 ? excludeSeedId : 0}`

  let perDb = resultCache.get(db)
  if (!perDb) {
    perDb = new Map()
    resultCache.set(db, perDb)
  }
  const hit = perDb.get(key)
  if (hit && hit.expiresAt > Date.now()) return hit.promise

  const entry: CachedResult = {
    expiresAt: Date.now() + RESULT_CACHE_TTL_MS,
    promise: computeHomeSimilar(db, options),
  }
  perDb.set(key, entry)
  const forget = () => { if (perDb!.get(key) === entry) perDb!.delete(key) }
  entry.promise.then((result) => { if (!result.items.length) forget() }, forget)
  return entry.promise
}

async function computeHomeSimilar(
  db: ApiDb,
  options: {limit?: number; random?: () => number; excludeSeedId?: number | null} = {},
): Promise<HomeSimilarResult> {
  const limit = Math.min(Math.max(Number(options.limit) || 12, 1), 24)
  if (!libraryHasSimilarSignals(db)) {
    return {seed: null, seedItem: null, items: []}
  }

  const continueWatching = await getContinueWatching(db, CONTINUE_EXCLUDE_LIMIT)
  const excludeIds = continueWatching
    .map((row) => Number(row.id))
    .filter((id) => Number.isFinite(id) && id > 0)
  const excludeSeedId = Number(options.excludeSeedId)
  if (Number.isFinite(excludeSeedId) && excludeSeedId > 0) {
    excludeIds.push(excludeSeedId)
  }
  const excludeSet = new Set(excludeIds)

  // Keep Continue off the seed too — Similar should not echo that row.
  const viewed = loadViewedSeedCandidates(db, SEED_CANDIDATE_LIMIT)
    .filter((seed) => !excludeSet.has(seed.id))
  const randomPool = loadRandomSeedCandidates(db, SEED_CANDIDATE_LIMIT, options.random)
    .filter((seed) => !excludeSet.has(seed.id))
  const candidates = orderHomeSimilarSeeds(viewed, randomPool, {
    limit: SEED_CANDIDATE_LIMIT,
    viewedBias: VIEWED_SEED_BIAS,
    random: options.random,
  })

  for (const candidate of candidates) {
    const result = await buildSimilarForSeed(db, candidate, limit, excludeIds)
    if (result) return result
  }

  return {seed: null, seedItem: null, items: []}
}
