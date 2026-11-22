import type {ApiDb} from '../types/db'
import {createSettingsRepository} from '../db/repositories/settings'
import {queryAll} from '../db/utils/rawQuery'
import {DUPLICATE_POLICY_SETTING, parseDuplicatePolicy, groupSimilarityItems, groupSimilarityItemsAsync, type SimilarityGroupingProgress, compareSimilarity, pickSimilarityOriginal,
  type SimilarityItem, type SimilarityEvidence} from '../../shared/duplicateSimilarity'

export function readDuplicatePolicy(db: ApiDb) {
  return parseDuplicatePolicy(createSettingsRepository(db.drizzle).findByOption(DUPLICATE_POLICY_SETTING)?.value)
}
const SIMILARITY_COLUMNS = `m.id, m.mediaTypeId, m.path, m.basename, m.filesize, m.oshash,
    m.visualHash, m.visualHashTiles, COALESCE(v.width, i.width) AS width,
    COALESCE(v.height, i.height) AS height, COALESCE(m.mediaCreatedAt, m.createdAt) AS createdAt FROM media m
    LEFT JOIN videoMetadata v ON v.mediaId = m.id LEFT JOIN imageMetadata i ON i.mediaId = m.id`

export type SimilarityGroup = ReturnType<typeof groupSimilarityItems>[number]

/**
 * Copies of one card under the maintenance policy. One-to-many comparisons stay linear, so the
 * whole library of the card's media type is searched (no 5000-item scope limit).
 */
/** Reusable across many targets in one pass: cards with a visual index, per media type. */
export type SimilarityTargetCache = {visual: Map<number | null, SimilarityItem[]>}
export const createSimilarityTargetCache = (): SimilarityTargetCache => ({visual: new Map()})

export function findSimilarityGroupForTarget(db: ApiDb, targetId: number, cache?: SimilarityTargetCache): SimilarityGroup | null {
  const policy = readDuplicatePolicy(db)
  const target = queryAll<SimilarityItem>(db, `SELECT ${SIMILARITY_COLUMNS} WHERE m.id = :targetId AND m.deletedAt IS NULL`, {targetId})[0]
  if (!target) return null
  // Same prefilter as pairwise grouping: only cards that can produce a strong match.
  const clauses: string[] = []
  if (target.oshash) clauses.push('(m.oshash = :oshash AND m.filesize = :filesize)')
  const visual = policy.searchSimilarVideos && Boolean(target.visualHash || target.visualHashTiles)
  const visualSql = '(m.visualHash IS NOT NULL OR m.visualHashTiles IS NOT NULL)'
  if (visual && !cache) clauses.push(visualSql)
  if (!clauses.length && !visual) return null
  const typeId = target.mediaTypeId ?? null
  const byId = new Map<number, SimilarityItem>()
  if (clauses.length) {
    for (const row of queryAll<SimilarityItem>(db, `SELECT ${SIMILARITY_COLUMNS}
      WHERE m.deletedAt IS NULL AND m.id != :targetId AND m.mediaTypeId IS :mediaTypeId AND (${clauses.join(' OR ')})`,
    {targetId, mediaTypeId: typeId, oshash: target.oshash ?? null, filesize: target.filesize ?? null})) byId.set(row.id, row)
  }
  if (visual && cache) {
    // The visual pool is the expensive part; load it once per pass and media type.
    let pool = cache.visual.get(typeId)
    if (!pool) {
      pool = queryAll<SimilarityItem>(db, `SELECT ${SIMILARITY_COLUMNS}
        WHERE m.deletedAt IS NULL AND m.mediaTypeId IS :mediaTypeId AND ${visualSql}`, {mediaTypeId: typeId})
      cache.visual.set(typeId, pool)
    }
    for (const row of pool) if (row.id !== targetId && !byId.has(row.id)) byId.set(row.id, row)
  }
  const candidates = [...byId.values()]
  const matches = candidates.filter(item => compareSimilarity(target, item, policy).eligible)
  if (!matches.length) return null

  // Prefer the policy's original when every member still passes against it; otherwise anchor on the card itself.
  const members = [target, ...matches]
  const preferredId = pickSimilarityOriginal(members, policy.priority)
  const anchoredOn = (original: SimilarityItem) => {
    const others = members.filter(item => item.id !== original.id)
    const similarity: SimilarityEvidence[] = others.map(item => compareSimilarity(original, item, policy))
    return similarity.every(match => match.eligible)
      ? {key: `similarity-${original.id}`, originalId: original.id, itemIds: [original.id, ...others.map(item => item.id)],
        similarity, similarityItems: [original, ...others]}
      : null
  }
  const preferred = members.find(item => item.id === preferredId)
  return (preferred && preferred.id !== target.id ? anchoredOn(preferred) : null) ?? anchoredOn(target)
}

export function loadSimilarityItems(db: ApiDb, mediaTypeId?: number | null, mediaIds?: number[] | null): SimilarityItem[] {
  if (mediaIds != null && !mediaIds.length) return []
  // Bound pair comparisons; filtered searches can always narrow a large library.
  const rows = queryAll<SimilarityItem>(db, `SELECT m.id, m.mediaTypeId, m.path, m.basename, m.filesize, m.oshash,
    m.visualHash, m.visualHashTiles, COALESCE(v.width, i.width) AS width,
    COALESCE(v.height, i.height) AS height, COALESCE(m.mediaCreatedAt, m.createdAt) AS createdAt FROM media m
    LEFT JOIN videoMetadata v ON v.mediaId = m.id LEFT JOIN imageMetadata i ON i.mediaId = m.id
    WHERE m.deletedAt IS NULL
      AND (:mediaTypeId IS NULL OR m.mediaTypeId = :mediaTypeId)
      ${mediaIds == null ? '' : 'AND m.id IN (:ids)'} LIMIT 5001`,
  {mediaTypeId: mediaTypeId || null, ...(mediaIds == null ? {} : {ids: mediaIds})})
  if (rows.length > 5000) throw Object.assign(new Error('similarity_scope_too_large'), {status: 400})
  return rows
}
export function listSimilarityGroups(db: ApiDb, mediaTypeId?: number | null, mediaIds?: number[] | null) {
  return groupSimilarityItems(loadSimilarityItems(db, mediaTypeId, mediaIds), readDuplicatePolicy(db))
}

/** Library-wide search that stays responsive: reports progress and stops when `signal` aborts. */
export async function listSimilarityGroupsAsync(db: ApiDb, mediaTypeId: number | null | undefined, mediaIds: number[] | null | undefined, options: {
  onProgress?: (progress: SimilarityGroupingProgress) => void
  signal?: AbortSignal
} = {}) {
  const items = loadSimilarityItems(db, mediaTypeId, mediaIds)
  options.onProgress?.({done: 0, total: items.length})
  return groupSimilarityItemsAsync(items, readDuplicatePolicy(db), options)
}
