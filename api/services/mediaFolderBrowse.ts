import type {ApiDb, AnyRecord} from '../types/db'
import {queryAllAsync} from '../db/utils/rawQuery'
import {orderRowsByIds} from './mediaItemsPagination'
import {
  attachMediaRelations,
  fetchBaseMediaRows,
} from './mediaItemsRelations'
import {createItemShell} from './mediaItemsPresentation'
import type {LoadedMediaItem} from '../types/mediaFilter'
import {
  buildLibraryFolderBreadcrumbs,
  libraryFolderDisplayName,
  libraryFolderParentPath,
  normalizeLibraryFolderPath,
} from '../../shared/libraryFolderBrowse'
import {getItemDiskRoot} from '../../shared/itemsGroupBy'

export type MediaFolderBrowseOptions = {
  path?: string | null
  mediaTypeId?: number | null
}

export type MediaFolderBrowseFolder = {
  path: string
  name: string
  mediaCount: number
}

export type MediaFolderBrowseResult = {
  currentPath: string | null
  parentPath: string | null
  breadcrumbs: Array<{path: string; name: string}>
  folders: MediaFolderBrowseFolder[]
  media: LoadedMediaItem[]
}

const ACTIVE_MEDIA_SQL = `(media.deletedAt IS NULL OR media.deletedAt = '')`
const NON_ZIP_SQL = `INSTR(REPLACE(media.path, '\\', '/'), '.zip!/') = 0`
const PATH_SQL = `REPLACE(media.path, '\\', '/')`

function mediaTypeClause(mediaTypeId: number | null | undefined): {
  sql: string
  replacements: Record<string, unknown>
} {
  if (mediaTypeId == null || !Number.isFinite(mediaTypeId) || mediaTypeId <= 0) {
    return {sql: '', replacements: {}}
  }
  return {
    sql: ' AND media.mediaTypeId = :mediaTypeId',
    replacements: {mediaTypeId: Number(mediaTypeId)},
  }
}

async function loadFolderMediaCards(
  db: ApiDb,
  ids: number[],
): Promise<LoadedMediaItem[]> {
  if (!ids.length) return []

  const rows = await fetchBaseMediaRows(db, null, ids)
  const ordered = orderRowsByIds(rows, ids)
  const items = ordered.map(createItemShell)
  await attachMediaRelations(db, items, null, ids)
  return items
}

async function browseRoots(
  db: ApiDb,
  mediaTypeId: number | null | undefined,
): Promise<MediaFolderBrowseResult> {
  const type = mediaTypeClause(mediaTypeId)
  const rows = await queryAllAsync<AnyRecord>(db, `
    SELECT mc_group_disk_root(media.path) AS rootPath, COUNT(*) AS mediaCount
    FROM media
    WHERE ${ACTIVE_MEDIA_SQL}
      AND ${NON_ZIP_SQL}
      AND mc_group_disk_root(media.path) != '#'
      ${type.sql}
    GROUP BY rootPath
    ORDER BY rootPath COLLATE NOCASE ASC
  `, type.replacements)

  const folders: MediaFolderBrowseFolder[] = rows
    .map((row) => {
      const path = normalizeLibraryFolderPath(String(row.rootPath || ''))
      if (!path) return null
      return {
        path,
        name: libraryFolderDisplayName(path),
        mediaCount: Number(row.mediaCount) || 0,
      }
    })
    .filter((row): row is MediaFolderBrowseFolder => Boolean(row))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: 'base'}))

  return {
    currentPath: null,
    parentPath: null,
    breadcrumbs: [],
    folders,
    media: [],
  }
}

async function browseFolder(
  db: ApiDb,
  folderPath: string,
  mediaTypeId: number | null | undefined,
): Promise<MediaFolderBrowseResult> {
  const folder = normalizeLibraryFolderPath(folderPath)
  const type = mediaTypeClause(mediaTypeId)
  const prefix = folder.endsWith('/') ? folder : `${folder}/`
  const prefixStart = prefix.length + 1
  const likePrefix = `${prefix}%`
  const replacements = {
    likePrefix,
    prefixStart,
    ...type.replacements,
  }

  const [folderRows, idRows] = await Promise.all([
    queryAllAsync<{childName: string; mediaCount: number}>(db, `
      SELECT
        SUBSTR(rel, 1, INSTR(rel, '/') - 1) AS childName,
        COUNT(*) AS mediaCount
      FROM (
        SELECT SUBSTR(${PATH_SQL}, :prefixStart) AS rel
        FROM media
        WHERE ${ACTIVE_MEDIA_SQL}
          AND ${NON_ZIP_SQL}
          AND ${PATH_SQL} LIKE :likePrefix
          AND INSTR(SUBSTR(${PATH_SQL}, :prefixStart), '/') > 0
          ${type.sql}
      ) AS nested
      GROUP BY childName
    `, replacements),
    queryAllAsync<{id: number}>(db, `
      SELECT media.id
      FROM media
      WHERE ${ACTIVE_MEDIA_SQL}
        AND ${NON_ZIP_SQL}
        AND ${PATH_SQL} LIKE :likePrefix
        AND INSTR(SUBSTR(${PATH_SQL}, :prefixStart), '/') = 0
        ${type.sql}
      ORDER BY media.name COLLATE NOCASE ASC, media.id ASC
    `, replacements),
  ])

  const folders: MediaFolderBrowseFolder[] = folderRows
    .map((row) => {
      const childName = String(row.childName || '')
      if (!childName) return null
      const path = normalizeLibraryFolderPath(`${folder}/${childName}`)
      if (!path) return null
      return {
        path,
        name: libraryFolderDisplayName(path),
        mediaCount: Number(row.mediaCount) || 0,
      }
    })
    .filter((row): row is MediaFolderBrowseFolder => Boolean(row))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: 'base'}))

  const directIds = idRows
    .map((row) => Number(row.id))
    .filter((id) => Number.isFinite(id) && id > 0)

  const media = await loadFolderMediaCards(db, directIds)

  return {
    currentPath: folder,
    parentPath: libraryFolderParentPath(folder),
    breadcrumbs: buildLibraryFolderBreadcrumbs(folder),
    folders,
    media,
  }
}

/**
 * Finder-style browse of indexed media paths (DB only, not filesystem).
 * `path` null/empty → disk roots that contain media.
 */
export async function browseLibraryFolders(
  db: ApiDb,
  options: MediaFolderBrowseOptions = {},
): Promise<MediaFolderBrowseResult> {
  const rawPath = options.path == null ? '' : String(options.path).trim()
  if (!rawPath) {
    return browseRoots(db, options.mediaTypeId)
  }

  const folder = normalizeLibraryFolderPath(rawPath)
  if (!folder) {
    return browseRoots(db, options.mediaTypeId)
  }

  // Reject zip virtual paths as browse targets.
  if (folder.includes('.zip!/')) {
    return {
      currentPath: folder,
      parentPath: libraryFolderParentPath(folder),
      breadcrumbs: buildLibraryFolderBreadcrumbs(folder),
      folders: [],
      media: [],
    }
  }

  // If the client somehow passes a file path, open its parent.
  const diskRoot = normalizeLibraryFolderPath(getItemDiskRoot(folder))
  if (diskRoot && diskRoot !== '#' && folder !== diskRoot) {
    // No-op: folder browse always treats input as a directory path.
  }

  return browseFolder(db, folder, options.mediaTypeId)
}
