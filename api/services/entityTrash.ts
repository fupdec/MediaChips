import type {ApiDb, AnyRecord} from '../types/db'
import {queryAll, queryGet} from '../db/utils/rawQuery'
import {nowIso} from '../db/utils/timestamps'
import {
  buildTrashTagName,
  ENTITY_TRASH_RETENTION_DAYS,
  inTrashSql,
  isPastTrashRetention,
  type TrashEntityKind,
} from '../../shared/entityTrash'

export type EntityTrashItem = {
  kind: TrashEntityKind
  id: number
  name: string | null
  deletedAt: string
  metaId?: number | null
  mediaId?: number | null
}

function clampLimit(limit: number): number {
  return Math.min(Math.max(Number(limit) || 200, 1), 500)
}

function mapTrashRow(kind: TrashEntityKind, row: AnyRecord): EntityTrashItem {
  return {
    kind,
    id: Number(row.id),
    name: row.name == null ? null : String(row.name),
    deletedAt: String(row.deletedAt || ''),
    metaId: row.metaId == null ? null : Number(row.metaId),
    mediaId: row.mediaId == null ? null : Number(row.mediaId),
  }
}

function listTrashTable(
  db: ApiDb,
  kind: TrashEntityKind,
  table: string,
  selectSql: string,
  limit: number,
): EntityTrashItem[] {
  const rows = queryAll(db, `
    SELECT ${selectSql}
    FROM ${table}
    WHERE ${inTrashSql(table)}
    ORDER BY deletedAt DESC
    LIMIT :limit
  `, {limit: clampLimit(limit)})
  return rows.map((row) => mapTrashRow(kind, row))
}

function countTrashTable(db: ApiDb, table: string): number {
  const row = queryGet<{count?: number}>(db, `
    SELECT COUNT(*) AS count
    FROM ${table}
    WHERE ${inTrashSql(table)}
  `)
  return Number(row?.count) || 0
}

function listExpiredIds(db: ApiDb, table: string, nowMs: number, retentionDays: number): number[] {
  const rows = queryAll(db, `
    SELECT id, deletedAt
    FROM ${table}
    WHERE ${inTrashSql(table)}
  `)
  return rows
    .filter((row) => isPastTrashRetention(String(row.deletedAt || ''), nowMs, retentionDays))
    .map((row) => Number(row.id))
    .filter((id) => Number.isFinite(id) && id > 0)
}

export function softDeleteMark(db: ApiDb, markId: number): boolean {
  const id = Number(markId)
  if (!Number.isFinite(id) || id <= 0) return false
  const row = queryGet<AnyRecord>(db, `SELECT id, deletedAt FROM marks WHERE id = :id LIMIT 1`, {id})
  if (!row) return false
  if (row.deletedAt) return true
  db.sqlite.prepare(`UPDATE marks SET deletedAt = ? WHERE id = ?`).run(nowIso(), id)
  return true
}

export function softDeletePlaylist(db: ApiDb, playlistId: number): boolean {
  const id = Number(playlistId)
  if (!Number.isFinite(id) || id <= 0) return false
  const row = queryGet<AnyRecord>(db, `SELECT id, deletedAt FROM playlists WHERE id = :id LIMIT 1`, {id})
  if (!row) return false
  if (row.deletedAt) return true
  const deletedAt = nowIso()
  db.sqlite.prepare(`UPDATE playlists SET deletedAt = ?, updatedAt = ? WHERE id = ?`)
    .run(deletedAt, deletedAt, id)
  return true
}

export function softDeleteSavedFilter(db: ApiDb, filterId: number): boolean {
  const id = Number(filterId)
  if (!Number.isFinite(id) || id <= 0) return false
  const row = queryGet<AnyRecord>(db, `SELECT id, deletedAt FROM savedFilters WHERE id = :id LIMIT 1`, {id})
  if (!row) return false
  if (row.deletedAt) return true
  const deletedAt = nowIso()
  db.sqlite.prepare(`UPDATE savedFilters SET deletedAt = ?, updatedAt = ? WHERE id = ?`)
    .run(deletedAt, deletedAt, id)
  return true
}

export function softDeleteTag(db: ApiDb, tagId: number): boolean {
  const id = Number(tagId)
  if (!Number.isFinite(id) || id <= 0) return false
  const row = queryGet<AnyRecord>(db, `
    SELECT id, name, deletedAt FROM tags WHERE id = :id LIMIT 1
  `, {id})
  if (!row) return false
  if (row.deletedAt) return true

  const originalName = String(row.name || '')
  const trashName = buildTrashTagName(id, originalName)
  const deletedAt = nowIso()
  db.sqlite.prepare(`
    UPDATE tags
    SET deletedAt = ?,
        trashOriginalName = ?,
        name = ?,
        updatedAt = ?
    WHERE id = ?
  `).run(deletedAt, originalName || null, trashName, deletedAt, id)
  return true
}

export function restoreTrashMarks(db: ApiDb, ids: number[]): number[] {
  const restored: number[] = []
  for (const rawId of ids) {
    const id = Number(rawId)
    if (!Number.isFinite(id) || id <= 0) continue
    const row = queryGet<AnyRecord>(db, `SELECT id, deletedAt FROM marks WHERE id = :id LIMIT 1`, {id})
    if (!row?.deletedAt) continue
    db.sqlite.prepare(`UPDATE marks SET deletedAt = NULL WHERE id = ?`).run(id)
    restored.push(id)
  }
  return restored
}

export function restoreTrashPlaylists(db: ApiDb, ids: number[]): number[] {
  const restored: number[] = []
  const updatedAt = nowIso()
  for (const rawId of ids) {
    const id = Number(rawId)
    if (!Number.isFinite(id) || id <= 0) continue
    const row = queryGet<AnyRecord>(db, `SELECT id, deletedAt FROM playlists WHERE id = :id LIMIT 1`, {id})
    if (!row?.deletedAt) continue
    db.sqlite.prepare(`UPDATE playlists SET deletedAt = NULL, updatedAt = ? WHERE id = ?`).run(updatedAt, id)
    restored.push(id)
  }
  return restored
}

export function restoreTrashSavedFilters(db: ApiDb, ids: number[]): number[] {
  const restored: number[] = []
  const updatedAt = nowIso()
  for (const rawId of ids) {
    const id = Number(rawId)
    if (!Number.isFinite(id) || id <= 0) continue
    const row = queryGet<AnyRecord>(db, `SELECT id, deletedAt FROM savedFilters WHERE id = :id LIMIT 1`, {id})
    if (!row?.deletedAt) continue
    db.sqlite.prepare(`UPDATE savedFilters SET deletedAt = NULL, updatedAt = ? WHERE id = ?`).run(updatedAt, id)
    restored.push(id)
  }
  return restored
}

export function restoreTrashTags(db: ApiDb, ids: number[]): number[] {
  const restored: number[] = []
  for (const rawId of ids) {
    const id = Number(rawId)
    if (!Number.isFinite(id) || id <= 0) continue
    const row = queryGet<AnyRecord>(db, `
      SELECT id, deletedAt, trashOriginalName, name
      FROM tags WHERE id = :id LIMIT 1
    `, {id})
    if (!row?.deletedAt) continue

    const originalName = String(row.trashOriginalName || '').trim()
    if (!originalName) continue

    const conflict = queryGet<{id?: number}>(db, `
      SELECT id FROM tags
      WHERE lower(trim(name)) = lower(trim(:name))
        AND id != :id
        AND (deletedAt IS NULL OR deletedAt = '')
      LIMIT 1
    `, {name: originalName, id})
    if (conflict?.id) continue

    const updatedAt = nowIso()
    db.sqlite.prepare(`
      UPDATE tags
      SET name = ?,
          deletedAt = NULL,
          trashOriginalName = NULL,
          updatedAt = ?
      WHERE id = ?
    `).run(originalName, updatedAt, id)
    restored.push(id)
  }
  return restored
}

export function listTrashMarks(db: ApiDb, limit = 200): EntityTrashItem[] {
  return listTrashTable(db, 'mark', 'marks', `
    id,
    COALESCE(text, type, '#' || id) AS name,
    deletedAt,
    NULL AS metaId,
    mediaId
  `, limit)
}

export function listTrashPlaylists(db: ApiDb, limit = 200): EntityTrashItem[] {
  return listTrashTable(db, 'playlist', 'playlists', 'id, name, deletedAt, NULL AS metaId, NULL AS mediaId', limit)
}

export function listTrashSavedFilters(db: ApiDb, limit = 200): EntityTrashItem[] {
  return listTrashTable(db, 'savedFilter', 'savedFilters', 'id, name, deletedAt, metaId, NULL AS mediaId', limit)
}

export function listTrashTags(db: ApiDb, limit = 200): EntityTrashItem[] {
  return listTrashTable(db, 'tag', 'tags', `
    id,
    COALESCE(trashOriginalName, name) AS name,
    deletedAt,
    metaId,
    NULL AS mediaId
  `, limit)
}

export function countTrashMarks(db: ApiDb): number {
  return countTrashTable(db, 'marks')
}

export function countTrashPlaylists(db: ApiDb): number {
  return countTrashTable(db, 'playlists')
}

export function countTrashSavedFilters(db: ApiDb): number {
  return countTrashTable(db, 'savedFilters')
}

export function countTrashTags(db: ApiDb): number {
  return countTrashTable(db, 'tags')
}

export function listExpiredMarkIds(
  db: ApiDb,
  nowMs = Date.now(),
  retentionDays = ENTITY_TRASH_RETENTION_DAYS,
): number[] {
  return listExpiredIds(db, 'marks', nowMs, retentionDays)
}

export function listExpiredPlaylistIds(
  db: ApiDb,
  nowMs = Date.now(),
  retentionDays = ENTITY_TRASH_RETENTION_DAYS,
): number[] {
  return listExpiredIds(db, 'playlists', nowMs, retentionDays)
}

export function listExpiredSavedFilterIds(
  db: ApiDb,
  nowMs = Date.now(),
  retentionDays = ENTITY_TRASH_RETENTION_DAYS,
): number[] {
  return listExpiredIds(db, 'savedFilters', nowMs, retentionDays)
}

export function listExpiredTagIds(
  db: ApiDb,
  nowMs = Date.now(),
  retentionDays = ENTITY_TRASH_RETENTION_DAYS,
): number[] {
  return listExpiredIds(db, 'tags', nowMs, retentionDays)
}

export function getTrashedMarksForPurge(db: ApiDb, ids: number[]): EntityTrashItem[] {
  if (!ids.length) return []
  const rows = queryAll(db, `
    SELECT id, COALESCE(text, type, '#' || id) AS name, deletedAt, NULL AS metaId, mediaId
    FROM marks
    WHERE id IN (:ids) AND ${inTrashSql('marks')}
  `, {ids})
  return rows.map((row) => mapTrashRow('mark', row))
}

export function getTrashedPlaylistsForPurge(db: ApiDb, ids: number[]): EntityTrashItem[] {
  if (!ids.length) return []
  const rows = queryAll(db, `
    SELECT id, name, deletedAt, NULL AS metaId, NULL AS mediaId
    FROM playlists
    WHERE id IN (:ids) AND ${inTrashSql('playlists')}
  `, {ids})
  return rows.map((row) => mapTrashRow('playlist', row))
}

export function getTrashedSavedFiltersForPurge(db: ApiDb, ids: number[]): EntityTrashItem[] {
  if (!ids.length) return []
  const rows = queryAll(db, `
    SELECT id, name, deletedAt, metaId, NULL AS mediaId
    FROM savedFilters
    WHERE id IN (:ids) AND ${inTrashSql('savedFilters')}
  `, {ids})
  return rows.map((row) => mapTrashRow('savedFilter', row))
}

export function getTrashedTagsForPurge(db: ApiDb, ids: number[]): EntityTrashItem[] {
  if (!ids.length) return []
  const rows = queryAll(db, `
    SELECT id, COALESCE(trashOriginalName, name) AS name, deletedAt, metaId, NULL AS mediaId
    FROM tags
    WHERE id IN (:ids) AND ${inTrashSql('tags')}
  `, {ids})
  return rows.map((row) => mapTrashRow('tag', row))
}

/** Permanently remove a saved filter and its filter rows / tag links. */
export function hardDeleteSavedFilterCascade(db: ApiDb, filterId: number): void {
  const id = Number(filterId)
  if (!Number.isFinite(id) || id <= 0) return

  const links = queryAll<{rowId?: number}>(db, `
    SELECT rowId FROM filterRowsInSavedFilters WHERE filterId = :id
  `, {id})
  const rowIds = links
    .map((link) => Number(link.rowId))
    .filter((rowId) => Number.isFinite(rowId) && rowId > 0)

  db.sqlite.prepare(`DELETE FROM filterRowsInSavedFilters WHERE filterId = ?`).run(id)
  for (const rowId of rowIds) {
    db.sqlite.prepare(`DELETE FROM tagsInFilterRows WHERE rowId = ?`).run(rowId)
    db.sqlite.prepare(`DELETE FROM filterRows WHERE id = ?`).run(rowId)
  }
  db.sqlite.prepare(`DELETE FROM savedFilters WHERE id = ?`).run(id)
}

export function hardDeletePlaylistCascade(db: ApiDb, playlistId: number): void {
  const id = Number(playlistId)
  if (!Number.isFinite(id) || id <= 0) return
  db.sqlite.prepare(`DELETE FROM mediaInPlaylists WHERE playlistId = ?`).run(id)
  db.sqlite.prepare(`DELETE FROM playlists WHERE id = ?`).run(id)
}

export {ENTITY_TRASH_RETENTION_DAYS}
