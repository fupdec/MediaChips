import type {ApiDb} from '../types/db'
import {queryAll} from '../db/utils/rawQuery'
import {resolveDuplicateColumn} from './mediaDuplicatesFilterSql'
import {findVisualNearDuplicateClusters} from './visualHashBackfill'

export type MediaDuplicateGroup = {
  key: string
  itemIds: number[]
}

export type ListMediaDuplicateGroupsInput = {
  duplicatesBy: string
  mediaTypeId?: number | null
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

function listExactDuplicateGroups(
  db: ApiDb,
  duplicatesBy: string,
  mediaTypeId?: number | null,
): MediaDuplicateGroup[] {
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
): MediaDuplicateGroup[] {
  const clusters = findVisualNearDuplicateClusters(db, mediaTypeId)
  return clusters
    .slice(0, MAX_GROUPS)
    .map((cluster, index) => ({
      key: String(cluster.hash || `visual-${index}`),
      itemIds: cluster.ids.filter((id) => Number.isFinite(id) && id > 0),
    }))
    .filter((group) => group.itemIds.length >= 2)
}

export function listMediaDuplicateGroups(
  db: ApiDb,
  input: ListMediaDuplicateGroupsInput,
): {groups: MediaDuplicateGroup[]} {
  const duplicatesBy = String(input.duplicatesBy || 'filesize')
  const groups = isVisualDuplicatesMode(duplicatesBy)
    ? listVisualDuplicateGroups(db, input.mediaTypeId)
    : listExactDuplicateGroups(db, duplicatesBy, input.mediaTypeId)

  return {groups}
}
