import {listSimilarityGroups, findSimilarityGroupForTarget, createSimilarityTargetCache} from './duplicateSimilarity'
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
  /** When set, return only groups containing any of these items, searched across the whole DB of their media type. */
  targetMediaIds?: number[] | null
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

export function normalizeMediaIds(mediaIds?: number[] | null): number[] | null {
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
  targetMediaIds?: number[] | null,
): MediaDuplicateGroup[] {
  const scopedIds = normalizeMediaIds(mediaIds)
  if (scopedIds != null && !scopedIds.length) return []

  const targets = targetMediaIds == null ? null : new Set(targetMediaIds)
  const clusters = findVisualNearDuplicateClusters(db, mediaTypeId, {
    candidateIds: scopedIds,
  })
  return clusters
    .filter((cluster) => targets == null || cluster.ids.some((id) => targets.has(id)))
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
    return listVisualDuplicateGroups(db, resolvedTypeId, null, [targetId]).map(withTargetFirst)
  }

  const rows = queryAll<{key?: string, id?: number}>(db, buildTargetExactDuplicatesSql(duplicatesBy), {targetId})
  const itemIds = parseGroupedIdCsv(rows.map((row) => row.id).join(','))
  if (itemIds.length < 2) return []
  return [withTargetFirst({key: String(rows[0]?.key ?? targetId), itemIds})]
}

/** SQL for the exact-value duplicates of several media items at once (same column value, same media type). */
export function buildTargetsExactDuplicatesSql(duplicatesBy: string): string {
  const column = resolveDuplicateColumn(duplicatesBy)
  const valueNotEmpty = column === 'filesize'
    ? 'target.filesize > 0'
    : `target.${column} IS NOT NULL AND target.${column} != ''`
  return `
    SELECT target.id AS targetId, CAST(target.${column} AS TEXT) AS key, other.id AS id
    FROM media AS target
    JOIN media AS other
      ON other.${column} = target.${column}
     AND other.mediaTypeId = target.mediaTypeId
    WHERE target.id IN (:ids)
      AND ${valueNotEmpty}
    ORDER BY target.id, other.id
  `
}

/**
 * Groups for a selection of cards, each searched across the whole DB of its media type.
 * Groups never share a card: merging one group must not invalidate another one in the same list.
 */
function listDuplicateGroupsForTargets(
  db: ApiDb,
  duplicatesBy: string,
  targetIds: number[],
  mediaTypeId?: number | null,
): MediaDuplicateGroup[] {
  const typeByTarget = new Map<number, number | null>()
  for (const chunk of chunkArray(targetIds)) {
    const rows = queryAll<{id?: number, mediaTypeId?: number | null}>(
      db,
      'SELECT media.id AS id, media.mediaTypeId AS mediaTypeId FROM media WHERE media.id IN (:ids)',
      {ids: chunk},
    )
    for (const row of rows) {
      typeByTarget.set(Number(row.id), row.mediaTypeId == null ? null : Number(row.mediaTypeId))
    }
  }
  // Cards that no longer exist are skipped, in the order they were selected.
  const existingIds = targetIds.filter((id) => typeByTarget.has(id))
  if (!existingIds.length) return []
  if (existingIds.length === 1) {
    return listDuplicateGroupsForTarget(db, duplicatesBy, existingIds[0], mediaTypeId)
  }

  const groups: MediaDuplicateGroup[] = []
  const used = new Set<number>()
  const accept = (group: MediaDuplicateGroup): boolean => {
    if (group.itemIds.length < 2 || group.itemIds.some((id) => used.has(id))) return false
    for (const id of group.itemIds) used.add(id)
    groups.push(group)
    return true
  }

  if (duplicatesBy === 'similarity') {
    // One cache for the whole pass: the visual index of a media type is loaded only once.
    const cache = createSimilarityTargetCache()
    for (const targetId of existingIds) {
      if (used.has(targetId)) continue
      const group = findSimilarityGroupForTarget(db, targetId, cache)
      if (group) accept(group)
    }
    return groups
  }

  if (isVisualDuplicatesMode(duplicatesBy)) {
    const idsByType = new Map<number | null, number[]>()
    for (const id of existingIds) {
      const typeId = Number(typeByTarget.get(id) ?? mediaTypeId)
      const resolvedTypeId = Number.isFinite(typeId) && typeId > 0 ? typeId : null
      const list = idsByType.get(resolvedTypeId)
      if (list) list.push(id)
      else idsByType.set(resolvedTypeId, [id])
    }
    for (const [typeId, ids] of idsByType) {
      const selected = new Set(ids)
      for (const group of listVisualDuplicateGroups(db, typeId, null, ids)) {
        const lead = group.itemIds.find((id) => selected.has(id))
        accept(lead == null
          ? group
          : {...group, itemIds: [lead, ...group.itemIds.filter((id) => id !== lead)]})
      }
    }
    return groups.slice(0, MAX_GROUPS)
  }

  const sql = buildTargetsExactDuplicatesSql(duplicatesBy)
  const byTarget = new Map<number, {key: string, ids: number[]}>()
  for (const chunk of chunkArray(existingIds)) {
    const rows = queryAll<{targetId?: number, key?: string, id?: number}>(db, sql, {ids: chunk})
    for (const row of rows) {
      const targetId = Number(row.targetId)
      const id = Number(row.id)
      if (!Number.isFinite(targetId) || !Number.isFinite(id) || id <= 0) continue
      const entry = byTarget.get(targetId)
      if (entry) entry.ids.push(id)
      else byTarget.set(targetId, {key: String(row.key ?? targetId), ids: [id]})
    }
  }
  for (const targetId of existingIds) {
    const entry = byTarget.get(targetId)
    if (!entry || used.has(targetId)) continue
    accept({key: entry.key, itemIds: [targetId, ...entry.ids.filter((id) => id !== targetId)]})
  }
  return groups.slice(0, MAX_GROUPS)
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
  if (input.targetMediaIds != null) {
    return {
      groups: listDuplicateGroupsForTargets(
        db,
        duplicatesBy,
        normalizeMediaIds(input.targetMediaIds) ?? [],
        input.mediaTypeId,
      ),
    }
  }
  const mediaIds = normalizeMediaIds(input.mediaIds)
  if (duplicatesBy === 'similarity') return {groups: listSimilarityGroups(db, input.mediaTypeId, mediaIds)}
  const groups = isVisualDuplicatesMode(duplicatesBy)
    ? listVisualDuplicateGroups(db, input.mediaTypeId, mediaIds)
    : listExactDuplicateGroups(db, duplicatesBy, input.mediaTypeId, mediaIds)

  return {groups}
}
