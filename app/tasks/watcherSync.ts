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
  pathsEquivalent,
  normalizeMediaPath,
} from '../../api/utils/normalizeUserPath'
import {
  fileMatchesExtensions,
  parseMediaExtensions,
} from '../../api/utils/mediaExtensions'
import { isPathUnderExcluded } from '../../api/utils/watchedFolderExcludes'

const pathsMatch = (left: string, right: string) => pathsEquivalent(left, right)

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

function findEquivalentPath(target: string, paths: string[]): string | null {
  const targetKey = pathSyncKey(target)
  for (const candidate of paths) {
    if (pathSyncKey(candidate) === targetKey || pathsMatch(candidate, target)) {
      return candidate
    }
  }
  return null
}

function findEquivalentEntry(target: string, entries: WatcherFileEntry[]): WatcherFileEntry | null {
  const targetKey = pathSyncKey(target)
  for (const entry of entries) {
    const entryPath = String(entry.path)
    if (pathSyncKey(entryPath) === targetKey || pathsMatch(entryPath, target)) {
      return entry
    }
  }
  return null
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
    files: folderState.types.map((typeState) => ({
      type: typeState.type,
      lost: sortLost(typeState.lostEntries),
      new: sortPaths(typeState.newPaths),
    })),
  }
}

function mapMediaRowsToDbEntries(
  mediaRows: MediaLike[],
  folderPath: string,
  mediaTypeId: number | string,
): WatcherFileEntry[] {
  return mediaRows
    .filter((row) => Number(row.mediaTypeId) === Number(mediaTypeId))
    .filter((row) => row.path && isPathInsideFolder(String(row.path), folderPath))
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

    for (const folderState of this.folderStates) {
      const folderPath = folderState.folder.path
      const folderTypeIds = folderState.types.map((typeState) => typeState.type.id)
      const mediaRows = await loadMediaForFolder(this.db, folderPath, folderTypeIds)
      const unionExtensions = getUnionExtensions(folderState.folder.types || [])
      const excludedPaths = folderState.folder.excludedPaths || []
      const filesInFolder = unionExtensions.length
        ? await findFilesRecursive(folderPath, unionExtensions, excludedPaths)
        : []

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
    }

    return this.getReports()
  }

  async refreshDbPaths(): Promise<WatcherFolderReport[]> {
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
    }

    return this.getReports()
  }

  private async reconcileFsPathsWithDb(typeState: TypeSyncState): Promise<void> {
    for (const entry of typeState.dbEntries) {
      const entryPath = String(entry.path)
      if (findEquivalentPath(entryPath, typeState.fsPaths)) {
        continue
      }

      try {
        await fs.access(entryPath)
        typeState.fsPaths.push(normalizeMediaPath(entryPath))
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
          changed = this.applyFileAdded(typeState, filePath) || changed
        } else {
          changed = this.applyFileRemoved(typeState, filePath) || changed
        }
      }
    }

    return changed
  }

  private applyFileAdded(typeState: TypeSyncState, filePath: string): boolean {
    const existingFsPath = findEquivalentPath(filePath, typeState.fsPaths)
    if (!existingFsPath) {
      typeState.fsPaths.push(filePath)
    }

    const dbEntry = findEquivalentEntry(filePath, typeState.dbEntries)
    if (dbEntry) {
      typeState.lostEntries = typeState.lostEntries.filter((entry) => !pathsMatch(String(entry.path), filePath))
      typeState.newPaths = typeState.newPaths.filter((pathValue) => !pathsMatch(pathValue, filePath))
      return true
    }

    if (!findEquivalentPath(filePath, typeState.newPaths)) {
      typeState.newPaths.push(filePath)
      return true
    }

    return Boolean(existingFsPath)
  }

  private applyFileRemoved(typeState: TypeSyncState, filePath: string): boolean {
    const fsPath = findEquivalentPath(filePath, typeState.fsPaths)
    if (fsPath) {
      typeState.fsPaths = typeState.fsPaths.filter((pathValue) => !pathsMatch(pathValue, filePath))
    }

    typeState.newPaths = typeState.newPaths.filter((pathValue) => !pathsMatch(pathValue, filePath))

    const dbEntry = findEquivalentEntry(filePath, typeState.dbEntries)
    if (dbEntry && !findEquivalentEntry(filePath, typeState.lostEntries)) {
      typeState.lostEntries.push(dbEntry)
      return true
    }

    return Boolean(fsPath || dbEntry)
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
