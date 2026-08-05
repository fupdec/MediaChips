import type { ApiDb } from '../types/db'
import type { MediaId } from '../types/mediaFilter'
import { queryAllAsync } from '../db/utils/rawQuery'
import { chunkArray } from '../db/utils/chunk'

export type InheritedFolderTagRow = {
  mediaId: number
  tagId: number
  metaId: number
}

export type MediaPathRow = {
  id: number | string
  path?: string | null
}

type TaggedFolderRow = {
  folderPath: string
  tagId: number
  metaId: number
}

/** Mirror SQLite REPLACE(path, '\\', '/') used in folder inheritance SQL. */
export function normalizeMediaPathSeparators(filePath: string): string {
  return String(filePath || '').replace(/\\/g, '/')
}

/** Mirror RTRIM(REPLACE(folder, '\\', '/'), '/'). */
export function folderPathPrefix(folderPath: string): string {
  return normalizeMediaPathSeparators(folderPath).replace(/\/+$/, '')
}

/**
 * True when mediaPath is under folderPath (same rules as
 * buildMediaPathUnderFolderSql). Comparison is case-insensitive to match
 * SQLite's default ASCII LIKE behavior.
 */
export function isMediaPathUnderFolder(mediaPath: string, folderPath: string): boolean {
  const media = normalizeMediaPathSeparators(mediaPath).toLowerCase()
  const prefix = folderPathPrefix(folderPath).toLowerCase()
  if (!prefix) return false
  return media.startsWith(`${prefix}/`)
}

async function loadTaggedFolders(
  db: ApiDb,
  metaId?: number | null,
): Promise<Array<{folderPath: string; tagId: number; metaId: number}>> {
  const folderRows = await queryAllAsync(db, `
    SELECT fp.path AS folderPath, tif.tagId AS tagId, tif.metaId AS metaId
    FROM folderPaths fp
    INNER JOIN tagsInFolders tif ON tif.folderId = fp.id${metaId != null ? ' AND tif.metaId = :metaId' : ''}
  `, metaId != null ? {metaId} : {}) as TaggedFolderRow[]

  return folderRows.map((row) => ({
    folderPath: String(row.folderPath || ''),
    tagId: Number(row.tagId),
    metaId: Number(row.metaId),
  })).filter((row) => (
    row.folderPath
    && Number.isFinite(row.tagId)
    && Number.isFinite(row.metaId)
  ))
}

function matchInheritedFolderTags(
  mediaRows: MediaPathRow[],
  folders: Array<{folderPath: string; tagId: number; metaId: number}>,
): InheritedFolderTagRow[] {
  const rows: InheritedFolderTagRow[] = []
  for (const media of mediaRows) {
    const mediaId = Number(media.id)
    const mediaPath = String(media.path || '')
    if (!Number.isFinite(mediaId) || !mediaPath) continue

    for (const folder of folders) {
      if (!isMediaPathUnderFolder(mediaPath, folder.folderPath)) continue
      rows.push({
        mediaId,
        tagId: folder.tagId,
        metaId: folder.metaId,
      })
    }
  }
  return rows
}

/**
 * Resolve folder-inherited tags using already-loaded media paths (list hydrate).
 * Only queries tagged folders — skips the redundant `SELECT id, path FROM media`.
 */
export async function loadInheritedFolderTagsForMediaRows(
  db: ApiDb,
  mediaRows: MediaPathRow[],
  metaId?: number | null,
): Promise<InheritedFolderTagRow[]> {
  if (!mediaRows.length) return []

  const folders = await loadTaggedFolders(db, metaId)
  if (!folders.length) return []

  return matchInheritedFolderTags(mediaRows, folders)
}

/**
 * Resolve folder-inherited tags for a page of media ids.
 * Loads tagged folders once, then matches media paths in memory — avoids the
 * media × folderPaths cross join that previously ran on every list page.
 */
export async function loadInheritedFolderTagsByMediaIds(
  db: ApiDb,
  mediaIds: MediaId[],
  metaId?: number | null,
): Promise<InheritedFolderTagRow[]> {
  if (!mediaIds.length) return []

  const folders = await loadTaggedFolders(db, metaId)
  if (!folders.length) return []

  const mediaRows: MediaPathRow[] = []
  for (const chunk of chunkArray(mediaIds)) {
    const rows = await queryAllAsync(db, `
      SELECT id, path FROM media WHERE id IN (:mediaIds)
    `, {mediaIds: chunk}) as Array<{id: number; path: string}>
    mediaRows.push(...rows)
  }

  return matchInheritedFolderTags(mediaRows, folders)
}
