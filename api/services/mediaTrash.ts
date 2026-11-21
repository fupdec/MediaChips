import type {ApiDb, AnyRecord} from '../types/db'
import {queryAll, queryGet} from '../db/utils/rawQuery'
import {nowIso} from '../db/utils/timestamps'
import {
  buildTrashPath,
  isPastTrashRetention,
  MEDIA_TRASH_RETENTION_DAYS,
} from '../../shared/mediaTrash'

export type TrashMediaItem = {
  id: number
  name: string | null
  basename: string | null
  path: string | null
  originalPath: string | null
  mediaTypeId: number | null
  deletedAt: string
  purgeFile: boolean
  filesize: number | null
}

function mapTrashRow(row: AnyRecord): TrashMediaItem {
  return {
    id: Number(row.id),
    name: row.name == null ? null : String(row.name),
    basename: row.basename == null ? null : String(row.basename),
    path: row.path == null ? null : String(row.path),
    originalPath: row.trashOriginalPath == null ? null : String(row.trashOriginalPath),
    mediaTypeId: row.mediaTypeId == null ? null : Number(row.mediaTypeId),
    deletedAt: String(row.deletedAt || ''),
    purgeFile: Boolean(row.trashPurgeFile),
    filesize: row.filesize == null ? null : Number(row.filesize),
  }
}

export function listTrashMedia(db: ApiDb, limit = 200): TrashMediaItem[] {
  const rows = queryAll(db, `
    SELECT id, name, basename, path, trashOriginalPath, mediaTypeId, deletedAt, trashPurgeFile, filesize
    FROM media
    WHERE deletedAt IS NOT NULL AND deletedAt != ''
    ORDER BY deletedAt DESC
    LIMIT :limit
  `, {limit: Math.min(Math.max(Number(limit) || 200, 1), 500)})
  return rows.map(mapTrashRow)
}

export function countTrashMedia(db: ApiDb): number {
  const row = queryGet<{count?: number}>(db, `
    SELECT COUNT(*) AS count
    FROM media
    WHERE deletedAt IS NOT NULL AND deletedAt != ''
  `)
  return Number(row?.count) || 0
}

export function softDeleteMedia(
  db: ApiDb,
  mediaId: number,
  options: {purgeFile?: boolean} = {},
): boolean {
  const id = Number(mediaId)
  if (!Number.isFinite(id) || id <= 0) return false

  const row = queryGet<AnyRecord>(db, `
    SELECT id, path, basename, deletedAt
    FROM media
    WHERE id = :id
    LIMIT 1
  `, {id})
  if (!row) return false
  if (row.deletedAt) return true

  const originalPath = String(row.path || '')
  const basename = row.basename == null || row.basename === ''
    ? originalPath.split(/[\\/]/).pop()
    : String(row.basename)
  const trashPath = buildTrashPath(id, basename)
  const deletedAt = nowIso()

  db.sqlite.prepare(`
    UPDATE media
    SET deletedAt = ?,
        trashOriginalPath = ?,
        trashPurgeFile = ?,
        path = ?,
        updatedAt = ?
    WHERE id = ?
  `).run(
    deletedAt,
    originalPath || null,
    options.purgeFile ? 1 : 0,
    trashPath,
    deletedAt,
    id,
  )
  return true
}

/**
 * Moves many media rows to Trash in one SQLite transaction (one commit per batch
 * instead of one per row). Same per-row behaviour as `softDeleteMedia`.
 * If anything throws, the whole batch is rolled back.
 */
export function softDeleteMediaMany(
  db: ApiDb,
  mediaIds: number[],
  options: {purgeFile?: boolean} = {},
): {deletedIds: number[]; missingIds: number[]} {
  const select = db.sqlite.prepare(
    'SELECT id, path, basename, deletedAt FROM media WHERE id = ? LIMIT 1',
  )
  const update = db.sqlite.prepare(`
    UPDATE media
    SET deletedAt = ?,
        trashOriginalPath = ?,
        trashPurgeFile = ?,
        path = ?,
        updatedAt = ?
    WHERE id = ?
  `)
  const purgeFile = options.purgeFile ? 1 : 0

  const run = db.sqlite.transaction((ids: number[]) => {
    const deletedIds: number[] = []
    const missingIds: number[] = []
    const deletedAt = nowIso()
    for (const rawId of ids) {
      const id = Number(rawId)
      if (!Number.isFinite(id) || id <= 0) continue
      const row = select.get(id) as AnyRecord | undefined
      if (!row) {
        missingIds.push(id)
        continue
      }
      if (row.deletedAt) {
        deletedIds.push(id)
        continue
      }
      const originalPath = String(row.path || '')
      const basename = row.basename == null || row.basename === ''
        ? originalPath.split(/[\\/]/).pop()
        : String(row.basename)
      update.run(
        deletedAt,
        originalPath || null,
        purgeFile,
        buildTrashPath(id, basename),
        deletedAt,
        id,
      )
      deletedIds.push(id)
    }
    return {deletedIds, missingIds}
  })

  return run(mediaIds)
}

export function restoreTrashMedia(db: ApiDb, mediaIds: number[]): number[] {
  const restored: number[] = []
  for (const rawId of mediaIds) {
    const id = Number(rawId)
    if (!Number.isFinite(id) || id <= 0) continue
    const row = queryGet<AnyRecord>(db, `
      SELECT id, trashOriginalPath, deletedAt
      FROM media
      WHERE id = :id
      LIMIT 1
    `, {id})
    if (!row?.deletedAt) continue

    const originalPath = String(row.trashOriginalPath || '')
    if (!originalPath) continue

    // Avoid unique path collisions if another active row reclaimed the path.
    const conflict = queryGet<{id?: number}>(db, `
      SELECT id FROM media
      WHERE path = :path AND id != :id
        AND (deletedAt IS NULL OR deletedAt = '')
      LIMIT 1
    `, {path: originalPath, id})
    if (conflict?.id) continue

    const updatedAt = nowIso()
    db.sqlite.prepare(`
      UPDATE media
      SET path = ?,
          deletedAt = NULL,
          trashOriginalPath = NULL,
          trashPurgeFile = 0,
          updatedAt = ?
      WHERE id = ?
    `).run(originalPath, updatedAt, id)
    restored.push(id)
  }
  return restored
}

export function listExpiredTrashIds(
  db: ApiDb,
  nowMs: number = Date.now(),
  retentionDays: number = MEDIA_TRASH_RETENTION_DAYS,
): number[] {
  const rows = queryAll(db, `
    SELECT id, deletedAt
    FROM media
    WHERE deletedAt IS NOT NULL AND deletedAt != ''
  `)
  return rows
    .filter((row) => isPastTrashRetention(String(row.deletedAt || ''), nowMs, retentionDays))
    .map((row) => Number(row.id))
    .filter((id) => Number.isFinite(id) && id > 0)
}

export function getTrashMediaForPurge(db: ApiDb, mediaIds: number[]): TrashMediaItem[] {
  if (!mediaIds.length) return []
  const rows = queryAll(db, `
    SELECT id, name, basename, path, trashOriginalPath, mediaTypeId, deletedAt, trashPurgeFile, filesize
    FROM media
    WHERE id IN (:ids)
      AND deletedAt IS NOT NULL AND deletedAt != ''
  `, {ids: mediaIds})
  return rows.map(mapTrashRow)
}
