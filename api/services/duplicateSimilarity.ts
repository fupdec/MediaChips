import type {ApiDb} from '../types/db'
import {createSettingsRepository} from '../db/repositories/settings'
import {queryAll} from '../db/utils/rawQuery'
import {DUPLICATE_POLICY_SETTING, parseDuplicatePolicy, groupSimilarityItems, type SimilarityItem} from '../../shared/duplicateSimilarity'

export function readDuplicatePolicy(db: ApiDb) {
  return parseDuplicatePolicy(createSettingsRepository(db.drizzle).findByOption(DUPLICATE_POLICY_SETTING)?.value)
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
