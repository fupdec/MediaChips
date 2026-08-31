import type { ApiDb, MediaLike } from '../../api/types/db'
import type {
  WatchedFolderEntry,
  WatchedMediaTypeEntry,
  WatcherFileEntry,
  WatcherFolderReport,
} from '../types/websockets'
import path from 'path'
import { promises as fs } from 'fs'
import { createMediaRepository } from '../../api/db/repositories/media'
import {
  isPathInsideFolder,
  normalizeMediaPath,
} from '../../api/utils/normalizeUserPath'
import {
  fileMatchesExtensions,
  parseMediaExtensions,
} from '../../api/utils/mediaExtensions'
import { isPathUnderExcluded } from '../../api/utils/watchedFolderExcludes'

/** Keep inbox/WS payloads small — full totals stay in newTotal/lostTotal. */
export const MAX_WATCHER_REPORT_PATHS = 500

/** Stable lowercase key for O(1) path set membership (slash-normalized). */
function pathSyncKey(value: string): string {
  return normalizeMediaPath(value).replace(/\\/g, '/').toLowerCase()
}

function buildPathSyncKeySet(paths: Iterable<string>): Set<string> {
  const keys = new Set<string>()
  for (const value of paths) {
    if (!value) continue
    keys.add(pathSyncKey(value))
  }
  return keys
}

function parseExtensions(extensions: string): string[] {
  return parseMediaExtensions(extensions)
}

function sortPaths(paths: string[]): string[] {
  return [...paths].sort((a, b) => a.localeCompare(b))
}

function sortLost(entries: WatcherFileEntry[]): WatcherFileEntry[] {
  return [...entries].sort((a, b) => String(a.path).localeCompare(String(b.path)))
}

async function findFilesRecursive(
  dir: string,
  extensions: string[],
  excludedPaths: string[] = [],
  depth = 0,
  maxDepth = 10,
  allFiles: string[] = [],
): Promise<string[]> {
  if (depth > maxDepth) {
    return allFiles
  }

  if (isPathUnderExcluded(dir, excludedPaths)) {
    return allFiles
  }

  let entries: import('fs').Dirent[] = []
  try {
    entries = await fs.readdir(dir, {withFileTypes: true})
  } catch {
    return allFiles
  }

  const subdirTasks: Promise<void>[] = []

  for (const entry of entries) {
    const filePath = path.join(dir, entry.name)

    if (isPathUnderExcluded(filePath, excludedPaths)) {
      continue
    }

    if (entry.isDirectory()) {
      subdirTasks.push(
        findFilesRecursive(
          filePath,
          extensions,
          excludedPaths,
          depth + 1,
          maxDepth,
          allFiles,
        ).then(() => undefined),
      )
      continue
    }

    if (entry.isFile() && fileMatchesExtensions(filePath, extensions)) {
      allFiles.push(normalizeMediaPath(filePath))
    }
  }

  if (subdirTasks.length) {
    await Promise.all(subdirTasks)
  }

  return allFiles
}

function getUnionExtensions(types: WatchedMediaTypeEntry[]): string[] {
  const extensions = new Set<string>()
  for (const type of types) {
    parseExtensions(type.extensions).forEach((ext) => extensions.add(ext))
  }
  return [...extensions]
}

interface TypeSyncState {
  type: WatchedMediaTypeEntry
  extensions: string[]
  fsPaths: string[]
  dbEntries: WatcherFileEntry[]
  newPaths: string[]
  lostEntries: WatcherFileEntry[]
}

interface FolderSyncState {
  folder: WatchedFolderEntry
  types: TypeSyncState[]
}

function recomputeDiff(state: TypeSyncState): void {
  // O(n+m) via normalized keys — nested pathsMatch loops are O(n*m) and freeze
  // the event loop on large watched trees (~25k Downloads + library rows).
  const dbKeys = buildPathSyncKeySet(state.dbEntries.map((entry) => String(entry.path)))
  const fsKeys = buildPathSyncKeySet(state.fsPaths)

  state.newPaths = state.fsPaths.filter((fsPath) => !dbKeys.has(pathSyncKey(fsPath)))
  state.lostEntries = state.dbEntries.filter(
    (entry) => !fsKeys.has(pathSyncKey(String(entry.path))),
  )
}

function buildReport(folderState: FolderSyncState): WatcherFolderReport {
  return {
    folder: folderState.folder,
    files: folderState.types.map((typeState) => {
      const newSorted = sortPaths(typeState.newPaths)
      const lostSorted = sortLost(typeState.lostEntries)
      return {
        type: typeState.type,
        new: newSorted.slice(0, MAX_WATCHER_REPORT_PATHS),
        lost: lostSorted.slice(0, MAX_WATCHER_REPORT_PATHS),
        newTotal: newSorted.length,
        lostTotal: lostSorted.length,
      }
    }),
  }
}

function mapMediaRowsToDbEntries(
  mediaRows: MediaLike[],
  folderPath: string,
  mediaTypeId: number | string,
): WatcherFileEntry[] {
  const folderKey = pathSyncKey(folderPath).replace(/\/+$/, '')
  const prefix = `${folderKey}/`
  const typeId = Number(mediaTypeId)

  return mediaRows
    .filter((row) => Number(row.mediaTypeId) === typeId)
    .filter((row) => {
      if (!row.path) return false
      const key = pathSyncKey(String(row.path))
      // Cheap prefix check — repo already scopes under folder; avoid path.resolve per row.
      return key === folderKey || key.startsWith(prefix)
    })
    .map((row) => ({path: normalizeMediaPath(String(row.path)), id: row.id}))
}

async function loadMediaForFolder(
  db: ApiDb,
  folderPath: string,
  typeIds: Array<number | string>,
): Promise<MediaLike[]> {
  const uniqueIds = [...new Set(typeIds.map((id) => Number(id)).filter((id) => Number.isFinite(id)))]
  if (!uniqueIds.length) {
    return []
  }

  return createMediaRepository(db.drizzle)
    .findPathEntriesByMediaTypeIdsUnderFolder(uniqueIds, folderPath) as MediaLike[]
}

class WatcherSyncEngine {
  private folderStates: FolderSyncState[] = []

  constructor(private readonly db: ApiDb) {}

  setFolders(folders: WatchedFolderEntry[]): void {
    this.folderStates = folders.map((folder) => ({
      folder,
      types: (folder.types || []).map((type) => ({
        type,
        extensions: parseExtensions(type.extensions),
        fsPaths: [],
        dbEntries: [],
        newPaths: [],
        lostEntries: [],
      })),
    }))
  }

  getReports(): WatcherFolderReport[] {
    return this.folderStates
      .map((folderState) => buildReport(folderState))
      .filter((report) => report.files.length > 0)
  }

  reset(): void {
    this.folderStates = []
  }

  syncFolderMetadata(folders: WatchedFolderEntry[]): void {
    for (const folder of folders) {
      const folderState = this.folderStates.find(
        (state) => state.folder.path === folder.path,
      )
      if (!folderState) {
        continue
      }

      folderState.folder = folder

      for (const type of folder.types || []) {
        const typeState = folderState.types.find(
          (entry) => Number(entry.type.id) === Number(type.id),
        )
        if (typeState) {
          typeState.type = type
          typeState.extensions = parseExtensions(type.extensions)
        }
      }
    }
  }

  async fullSync(folders: WatchedFolderEntry[]): Promise<WatcherFolderReport[]> {
    this.setFolders(folders)
    const t0 = Date.now()

    for (const folderState of this.folderStates) {
      const folderPath = folderState.folder.path
      const folderTypeIds = folderState.types.map((typeState) => typeState.type.id)
      const tDb = Date.now()
      const mediaRows = await loadMediaForFolder(this.db, folderPath, folderTypeIds)
      const unionExtensions = getUnionExtensions(folderState.folder.types || [])
      const excludedPaths = folderState.folder.excludedPaths || []
      const tWalk = Date.now()
      const filesInFolder = unionExtensions.length
        ? await findFilesRecursive(folderPath, unionExtensions, excludedPaths)
        : []
      const tDiff = Date.now()

      for (const typeState of folderState.types) {
        typeState.fsPaths = filesInFolder.filter(
          (filePath) => fileMatchesExtensions(filePath, typeState.extensions),
        )
        typeState.dbEntries = mapMediaRowsToDbEntries(
          mediaRows,
          folderPath,
          typeState.type.id,
        ).filter((entry) => !isPathUnderExcluded(String(entry.path), excludedPaths))
        recomputeDiff(typeState)
      }

      console.log(
        `[watcher] fullSync ${folderPath}: db=${mediaRows.length} fs=${filesInFolder.length} `
        + `dbMs=${tWalk - tDb} walkMs=${tDiff - tWalk} diffMs=${Date.now() - tDiff} totalMs=${Date.now() - t0}`,
      )
    }

    return this.getReports()
  }

  async refreshDbPaths(): Promise<WatcherFolderReport[]> {
    const t0 = Date.now()

    for (const folderState of this.folderStates) {
      const folderPath = folderState.folder.path
      const folderTypeIds = folderState.types.map((typeState) => typeState.type.id)
      const mediaRows = await loadMediaForFolder(this.db, folderPath, folderTypeIds)

      for (const typeState of folderState.types) {
        typeState.dbEntries = mapMediaRowsToDbEntries(
          mediaRows,
          folderPath,
          typeState.type.id,
        ).filter((entry) => !isPathUnderExcluded(
          String(entry.path),
          folderState.folder.excludedPaths,
        ))
        await this.reconcileFsPathsWithDb(typeState)
        recomputeDiff(typeState)
      }

      console.log(
        `[watcher] refreshDb ${folderPath}: db=${mediaRows.length} totalMs=${Date.now() - t0}`,
      )
    }

    return this.getReports()
  }

  private async reconcileFsPathsWithDb(typeState: TypeSyncState): Promise<void> {
    // O(n+m) Set membership — linear findEquivalentPath here is O(n*m) and freezes
    // refresh after fullSync on large libraries (~25k Downloads).
    const fsKeys = buildPathSyncKeySet(typeState.fsPaths)

    for (const entry of typeState.dbEntries) {
      const entryPath = String(entry.path)
      const entryKey = pathSyncKey(entryPath)
      if (fsKeys.has(entryKey)) {
        continue
      }

      try {
        await fs.access(entryPath)
        const normalized = normalizeMediaPath(entryPath)
        typeState.fsPaths.push(normalized)
        fsKeys.add(pathSyncKey(normalized))
      } catch {
        // File is genuinely missing from disk.
      }
    }
  }

  applyFileEvent(event: 'add' | 'unlink', rawPath: string): boolean {
    const filePath = normalizeMediaPath(rawPath)
    if (!filePath) {
      return false
    }

    const fileKey = pathSyncKey(filePath)
    let changed = false

    for (const folderState of this.folderStates) {
      if (!isPathInsideFolder(filePath, folderState.folder.path)) {
        continue
      }

      if (isPathUnderExcluded(filePath, folderState.folder.excludedPaths)) {
        continue
      }

      for (const typeState of folderState.types) {
        if (!fileMatchesExtensions(filePath, typeState.extensions)) {
          continue
        }

        if (event === 'add') {
          changed = this.applyFileAdded(typeState, filePath, fileKey) || changed
        } else {
          changed = this.applyFileRemoved(typeState, filePath, fileKey) || changed
        }
      }
    }

    return changed
  }

  private applyFileAdded(
    typeState: TypeSyncState,
    filePath: string,
    fileKey: string,
  ): boolean {
    const fsKeys = buildPathSyncKeySet(typeState.fsPaths)
    const hadFs = fsKeys.has(fileKey)
    if (!hadFs) {
      typeState.fsPaths.push(filePath)
    }

    const dbEntry = typeState.dbEntries.find((entry) => pathSyncKey(String(entry.path)) === fileKey)
    if (dbEntry) {
      typeState.lostEntries = typeState.lostEntries.filter(
        (entry) => pathSyncKey(String(entry.path)) !== fileKey,
      )
      typeState.newPaths = typeState.newPaths.filter(
        (pathValue) => pathSyncKey(pathValue) !== fileKey,
      )
      return true
    }

    const newKeys = buildPathSyncKeySet(typeState.newPaths)
    if (!newKeys.has(fileKey)) {
      typeState.newPaths.push(filePath)
      return true
    }

    return hadFs
  }

  private applyFileRemoved(
    typeState: TypeSyncState,
    filePath: string,
    fileKey: string,
  ): boolean {
    const hadFs = typeState.fsPaths.some((pathValue) => pathSyncKey(pathValue) === fileKey)
    if (hadFs) {
      typeState.fsPaths = typeState.fsPaths.filter((pathValue) => pathSyncKey(pathValue) !== fileKey)
    }

    typeState.newPaths = typeState.newPaths.filter((pathValue) => pathSyncKey(pathValue) !== fileKey)

    const dbEntry = typeState.dbEntries.find((entry) => pathSyncKey(String(entry.path)) === fileKey)
    const alreadyLost = dbEntry
      && typeState.lostEntries.some((entry) => pathSyncKey(String(entry.path)) === fileKey)
    if (dbEntry && !alreadyLost) {
      typeState.lostEntries.push(dbEntry)
      return true
    }

    return Boolean(hadFs || dbEntry)
  }
}

export {
  WatcherSyncEngine,
  loadMediaForFolder,
  mapMediaRowsToDbEntries,
  parseExtensions,
  fileMatchesExtensions,
  recomputeDiff,
  pathSyncKey,
  buildPathSyncKeySet,
}
