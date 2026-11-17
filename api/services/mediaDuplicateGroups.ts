import {listSimilarityGroups, findSimilarityGroupForTarget} from './duplicateSimilarity'
import type {SimilarityEvidence} from '../../shared/duplicateSimilarity'
import type {VisualMatchEvidence} from './visualHashSimilarity'
import type {ApiDb} from '../types/db'
import {chunkArray} from '../db/utils/chunk'
import {queryAll} from '../db/utils/rawQuery'
import {resolveDuplicateColumn} from './mediaDuplicatesFilterSql'
import {findVisualNearDuplicateClusters} from './visualHashBackfill'

export type MediaDuplicateGroup = {
  key: string
  itemIds: number[]
  confidence?: 'confident' | 'possible'
  matches?: VisualMatchEvidence[]
  originalId?: number
  similarityItems?: import('../../shared/duplicateSimilarity').SimilarityItem[]
  similarity?: SimilarityEvidence[]
}

export type ListMediaDuplicateGroupsInput = {
  duplicatesBy: string
  mediaTypeId?: number | null
  /** When set, only group within this candidate set (filtered grid / list scope). */
  mediaIds?: number[] | null
  /** When set, return only groups containing this item, searched across the whole DB of its media type. */
  targetMediaId?: number | null
}

const MAX_GROUPS = 1000

export function isVisualDuplicatesMode(duplicatesBy: string): boolean {
  return duplicatesBy === 'visualHash' || duplicatesBy === 'visual'
}

/** Pure helper: parse GROUP_CONCAT id strings into unique positive ids. */
export function parseGroupedIdCsv(value: unknown): number[] {
  const raw = String(value ?? '')
  if (!raw) return []
  const ids: number[] = []
  const seen = new Set<number>()
  for (const part of raw.split(',')) {
    const id = Number(part)
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

function normalizeMediaIds(mediaIds?: number[] | null): number[] | null {
  if (mediaIds == null) return null
  const ids: number[] = []
  const seen = new Set<number>()
  for (const value of mediaIds) {
    const id = Number(value)
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

export function buildExactDuplicateGroupsSql(
  duplicatesBy: string,
  hasMediaTypeId: boolean,
): string {
  const column = resolveDuplicateColumn(duplicatesBy)
  const valueNotEmpty = column === 'filesize'
    ? 'media.filesize > 0'
    : `media.${column} IS NOT NULL AND media.${column} != ''`
  const typeClause = hasMediaTypeId ? 'media.mediaTypeId = :mediaTypeId AND' : ''

  return `
    SELECT CAST(dupVal AS TEXT) AS key, GROUP_CONCAT(id) AS idsCsv
    FROM (
      SELECT media.id AS id, media.${column} AS dupVal
      FROM media
      WHERE ${typeClause} ${valueNotEmpty}
    ) AS scoped
    GROUP BY dupVal
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT ${MAX_GROUPS}
  `
}

function listExactDuplicateGroupsAmongIds(
  db: ApiDb,
  duplicatesBy: string,
  mediaIds: number[],
): MediaDuplicateGroup[] {
  if (!mediaIds.length) return []

  const column = resolveDuplicateColumn(duplicatesBy)
  const valueNotEmpty = column === 'filesize'
    ? 'media.filesize > 0'
    : `media.${column} IS NOT NULL AND media.${column} != ''`

  const byValue = new Map<string, number[]>()
  for (const chunk of chunkArray(mediaIds)) {
    const rows = queryAll<{id?: number, dupVal?: string | number | null}>(db, `
      SELECT media.id AS id, media.${column} AS dupVal
      FROM media
      WHERE media.id IN (:ids)
        AND ${valueNotEmpty}
    `, {ids: chunk})

    for (const row of rows) {
      const id = Number(row.id)
      if (!Number.isFinite(id) || id <= 0) continue
      const key = String(row.dupVal ?? '')
      if (column === 'filesize') {
        if (!(Number(row.dupVal) > 0)) continue
      } else if (!key) {
        continue
      }
      const list = byValue.get(key)
      if (list) list.push(id)
      else byValue.set(key, [id])
    }
  }

  return [...byValue.entries()]
    .map(([key, itemIds]) => ({key, itemIds}))
    .filter((group) => group.itemIds.length >= 2)
    .sort((a, b) => b.itemIds.length - a.itemIds.length)
    .slice(0, MAX_GROUPS)
}

function listExactDuplicateGroups(
  db: ApiDb,
  duplicatesBy: string,
  mediaTypeId?: number | null,
  mediaIds?: number[] | null,
): MediaDuplicateGroup[] {
  const scopedIds = normalizeMediaIds(mediaIds)
  if (scopedIds != null) {
    return listExactDuplicateGroupsAmongIds(db, duplicatesBy, scopedIds)
  }

  const typeId = Number(mediaTypeId)
  const hasMediaTypeId = Number.isFinite(typeId) && typeId > 0
  const sql = buildExactDuplicateGroupsSql(duplicatesBy, hasMediaTypeId)
  const rows = queryAll<{key?: string, idsCsv?: string}>(
    db,
    sql,
    hasMediaTypeId ? {mediaTypeId: typeId} : {},
  )

  return rows
    .map((row) => ({
      key: String(row.key ?? ''),
      itemIds: parseGroupedIdCsv(row.idsCsv),
    }))
    .filter((group) => group.key && group.itemIds.length >= 2)
}

function listVisualDuplicateGroups(
  db: ApiDb,
  mediaTypeId?: number | null,
  mediaIds?: number[] | null,
  targetMediaId?: number | null,
): MediaDuplicateGroup[] {
  const scopedIds = normalizeMediaIds(mediaIds)
  if (scopedIds != null && !scopedIds.length) return []

  const clusters = findVisualNearDuplicateClusters(db, mediaTypeId, {
    candidateIds: scopedIds,
  })
  return clusters
    .filter((cluster) => targetMediaId == null || cluster.ids.includes(targetMediaId))
    .slice(0, MAX_GROUPS)
    .map((cluster, index) => ({
      key: String(cluster.hash || `visual-${index}`),
      confidence: cluster.confidence,
      matches: cluster.matches,
      itemIds: cluster.ids.filter((id) => Number.isFinite(id) && id > 0),
    }))
    .filter((group) => group.itemIds.length >= 2)
}

/** SQL for the exact-value duplicates of one media item (same column value, same media type). */
export function buildTargetExactDuplicatesSql(duplicatesBy: string): string {
  const column = resolveDuplicateColumn(duplicatesBy)
  const valueNotEmpty = column === 'filesize'
    ? 'target.filesize > 0'
    : `target.${column} IS NOT NULL AND target.${column} != ''`
  return `
    SELECT CAST(target.${column} AS TEXT) AS key, other.id AS id
    FROM media AS target
    JOIN media AS other
      ON other.${column} = target.${column}
     AND other.mediaTypeId = target.mediaTypeId
    WHERE target.id = :targetId
      AND ${valueNotEmpty}
    ORDER BY other.id
  `
}

function listDuplicateGroupsForTarget(
  db: ApiDb,
  duplicatesBy: string,
  targetId: number,
  mediaTypeId?: number | null,
): MediaDuplicateGroup[] {
  const target = queryAll<{mediaTypeId?: number | null}>(
    db,
    'SELECT media.mediaTypeId AS mediaTypeId FROM media WHERE media.id = :targetId',
    {targetId},
  )[0]
  if (!target) return []
  const typeId = Number(target.mediaTypeId ?? mediaTypeId)
  const resolvedTypeId = Number.isFinite(typeId) && typeId > 0 ? typeId : null

  const withTargetFirst = (group: MediaDuplicateGroup): MediaDuplicateGroup => ({
    ...group,
    itemIds: [targetId, ...group.itemIds.filter((id) => id !== targetId)],
  })

  if (duplicatesBy === 'similarity') {
    // The policy's original leads the group; it is the suggested survivor.
    const group = findSimilarityGroupForTarget(db, targetId)
    return group ? [group] : []
  }
  if (isVisualDuplicatesMode(duplicatesBy)) {
    return listVisualDuplicateGroups(db, resolvedTypeId, null, targetId).map(withTargetFirst)
  }

  const rows = queryAll<{key?: string, id?: number}>(db, buildTargetExactDuplicatesSql(duplicatesBy), {targetId})
  const itemIds = parseGroupedIdCsv(rows.map((row) => row.id).join(','))
  if (itemIds.length < 2) return []
  return [withTargetFirst({key: String(rows[0]?.key ?? targetId), itemIds})]
}

export function listMediaDuplicateGroups(
  db: ApiDb,
  input: ListMediaDuplicateGroupsInput,
): {groups: MediaDuplicateGroup[]} {
  const duplicatesBy = String(input.duplicatesBy || 'filesize')
  const targetMediaId = Number(input.targetMediaId)
  if (Number.isFinite(targetMediaId) && targetMediaId > 0) {
    return {groups: listDuplicateGroupsForTarget(db, duplicatesBy, targetMediaId, input.mediaTypeId)}
  }
  const mediaIds = normalizeMediaIds(input.mediaIds)
  if (duplicatesBy === 'similarity') return {groups: listSimilarityGroups(db, input.mediaTypeId, mediaIds)}
  const groups = isVisualDuplicatesMode(duplicatesBy)
    ? listVisualDuplicateGroups(db, input.mediaTypeId, mediaIds)
    : listExactDuplicateGroups(db, duplicatesBy, input.mediaTypeId, mediaIds)

  return {groups}
}
