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
  id?: number | string | null
  path?: string | null
}

type TaggedFolderRow = {
  folderPath: string
  tagId: number
  metaId: number
}

export type FolderTagPrefixEntry = {
  tagId: number
  metaId: number
}

/** Normalized folder prefix → inherited tag rows (may contain duplicates). */
export type FolderTagPrefixIndex = Map<string, FolderTagPrefixEntry[]>

type CacheEntry = {
  generation: number
  index: FolderTagPrefixIndex
}

let cacheGeneration = 0
const cacheBySqlite = new WeakMap<object, CacheEntry>()

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

export function clearInheritedFolderTagsCache(): void {
  cacheGeneration += 1
}

/** Build a prefix map used for O(path-length) inheritance matching. */
export function buildFolderTagPrefixIndex(
  folders: Array<{folderPath: string; tagId: number; metaId: number}>,
): FolderTagPrefixIndex {
  const index: FolderTagPrefixIndex = new Map()
  for (const folder of folders) {
    const prefix = folderPathPrefix(folder.folderPath).toLowerCase()
    if (!prefix) continue
    const entry: FolderTagPrefixEntry = {
      tagId: folder.tagId,
      metaId: folder.metaId,
    }
    const list = index.get(prefix)
    if (list) list.push(entry)
    else index.set(prefix, [entry])
  }
  return index
}

/**
 * Match media paths against a folder-tag prefix index.
 * Emits one row per (media, folder-tag) — same multiplicity as nested-loop matching.
 */
export function matchInheritedFolderTagsWithIndex(
  mediaRows: MediaPathRow[],
  index: FolderTagPrefixIndex,
  metaId?: number | null,
): InheritedFolderTagRow[] {
  if (!mediaRows.length || !index.size) return []

  const rows: InheritedFolderTagRow[] = []
  for (const media of mediaRows) {
    const mediaId = Number(media.id)
    const mediaPath = String(media.path || '')
    if (!Number.isFinite(mediaId) || !mediaPath) continue

    const normalized = normalizeMediaPathSeparators(mediaPath).toLowerCase()
    for (let i = 1; i < normalized.length; i++) {
      if (normalized[i] !== '/') continue
      const prefix = normalized.slice(0, i)
      const entries = index.get(prefix)
      if (!entries) continue
      for (const entry of entries) {
        if (metaId != null && entry.metaId !== metaId) continue
        rows.push({
          mediaId,
          tagId: entry.tagId,
          metaId: entry.metaId,
        })
      }
    }
  }
  return rows
}

async function loadTaggedFolders(db: ApiDb): Promise<Array<{
  folderPath: string
  tagId: number
  metaId: number
}>> {
  const folderRows = await queryAllAsync(db, `
    SELECT fp.path AS folderPath, tif.tagId AS tagId, tif.metaId AS metaId
    FROM folderPaths fp
    INNER JOIN tagsInFolders tif ON tif.folderId = fp.id
  `) as TaggedFolderRow[]

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

async function getFolderTagPrefixIndex(db: ApiDb): Promise<FolderTagPrefixIndex> {
  const cacheKey = (db.sqlite || db) as object
  const cached = cacheBySqlite.get(cacheKey)
  if (cached && cached.generation === cacheGeneration) {
    return cached.index
  }

  const folders = await loadTaggedFolders(db)
  const index = buildFolderTagPrefixIndex(folders)
  cacheBySqlite.set(cacheKey, {generation: cacheGeneration, index})
  return index
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

  const index = await getFolderTagPrefixIndex(db)
  if (!index.size) return []

  return matchInheritedFolderTagsWithIndex(mediaRows, index, metaId)
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

  const index = await getFolderTagPrefixIndex(db)
  if (!index.size) return []

  const mediaRows: MediaPathRow[] = []
  for (const chunk of chunkArray(mediaIds)) {
    const rows = await queryAllAsync(db, `
      SELECT id, path FROM media WHERE id IN (:mediaIds)
    `, {mediaIds: chunk}) as Array<{id: number; path: string}>
    mediaRows.push(...rows)
  }

  return matchInheritedFolderTagsWithIndex(mediaRows, index, metaId)
}
