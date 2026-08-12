import type {ApiDb, AnyRecord} from '../types/db'
import {queryAll, queryGet} from '../db/utils/rawQuery'
import {
  CLIP_EMBEDDING_INDEX_KEY,
  findSimilarByClip,
} from './mediaClipEmbeddings'
import {loadMediaBasicsByIds} from './mediaItemsLoader'

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
  items: AnyRecord[]
}

const SEED_CANDIDATE_LIMIT = 8

function mapSeedRow(row: AnyRecord, reason: HomeSimilarSeedReason): HomeSimilarSeed {
  return {
    id: Number(row.id),
    name: row.name ?? null,
    basename: row.basename ?? null,
    path: row.path ?? null,
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

function loadSeedCandidates(db: ApiDb, reason: HomeSimilarSeedReason): HomeSimilarSeed[] {
  let sql = `
    SELECT media.id, media.name, media.basename, media.path, media.mediaTypeId
    FROM media
    INNER JOIN mediaClipEmbeddings e
      ON e.mediaId = media.id AND e.model = :model
  `
  if (reason === 'viewed') {
    sql += `
      WHERE media.viewedAt IS NOT NULL AND media.viewedAt != ''
      ORDER BY media.viewedAt DESC
    `
  } else if (reason === 'favorite') {
    sql += `
      WHERE media.favorite = 1
      ORDER BY media.viewedAt DESC, media.id DESC
    `
  } else {
    sql += `
      ORDER BY media.viewedAt DESC, media.id DESC
    `
  }
  sql += ` LIMIT :limit`

  const rows = queryAll(db, sql, {
    model: CLIP_EMBEDDING_INDEX_KEY,
    limit: SEED_CANDIDATE_LIMIT,
  })
  return rows.map((row) => mapSeedRow(row, reason))
}

export async function getHomeSimilar(
  db: ApiDb,
  options: {limit?: number; random?: () => number} = {},
): Promise<HomeSimilarResult> {
  const limit = Math.min(Math.max(Number(options.limit) || 12, 1), 24)
  const indexed = queryGet<{count?: number}>(db, `
    SELECT COUNT(*) AS count
    FROM mediaClipEmbeddings
    WHERE model = :model
  `, {model: CLIP_EMBEDDING_INDEX_KEY})
  if (!Number(indexed?.count)) {
    return {seed: null, items: []}
  }

  const pools: HomeSimilarSeedReason[] = ['viewed', 'favorite', 'any']
  let seed: HomeSimilarSeed | null = null
  for (const reason of pools) {
    const candidates = loadSeedCandidates(db, reason)
    const seedId = chooseHomeSimilarSeedId(
      candidates.map((entry) => entry.id),
      options.random,
    )
    if (seedId == null) continue
    seed = candidates.find((entry) => entry.id === seedId) || mapSeedRow({id: seedId}, reason)
    break
  }

  if (!seed) return {seed: null, items: []}

  const similar = await findSimilarByClip(db, seed.id, {limit: limit + 1})
  if (!similar.hasEmbedding) {
    return {seed: null, items: []}
  }

  const neighborIds = (similar.ids || [])
    .map(Number)
    .filter((id) => Number.isFinite(id) && id > 0 && id !== seed!.id)
    .slice(0, limit)

  if (!neighborIds.length) {
    return {seed, items: []}
  }

  const rows = await loadMediaBasicsByIds(db, neighborIds)
  const byId = new Map(rows.map((row: AnyRecord) => [Number(row.id), row]))
  const items = neighborIds
    .map((id) => {
      const row = byId.get(id)
      if (!row) return null
      return {
        ...row,
        tags: [],
        values: [],
        key: String(row.id),
      }
    })
    .filter(Boolean) as AnyRecord[]

  return {seed, items}
}
