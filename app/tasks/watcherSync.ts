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

const pathsMatch = (left: string, right: string) => pathsEquivalent(left, right)

function parseExtensions(extensions: string): string[] {
  return String(extensions || '')
    .split(',')
    .map((ext: string) => ext.trim().toLowerCase())
    .filter(Boolean)
}

function fileMatchesExtensions(filePath: string, extensions: string[]): boolean {
  if (!extensions.length) return true
  const fileExt = path.extname(filePath).toLowerCase().slice(1)
  return extensions.includes(fileExt)
}

function sortPaths(paths: string[]): string[] {
  return [...paths].sort((a, b) => a.localeCompare(b))
}

function sortLost(entries: WatcherFileEntry[]): WatcherFileEntry[] {
  return [...entries].sort((a, b) => String(a.path).localeCompare(String(b.path)))
}

function findEquivalentPath(target: string, paths: string[]): string | null {
  for (const candidate of paths) {
    if (pathsMatch(candidate, target)) {
      return candidate
    }
  }
  return null
}

function findEquivalentEntry(target: string, entries: WatcherFileEntry[]): WatcherFileEntry | null {
  for (const entry of entries) {
    if (pathsMatch(String(entry.path), target)) {
      return entry
    }
  }
  return null
}

async function findFilesRecursive(
  dir: string,
  extensions: string[],
  depth = 0,
  maxDepth = 10,
  allFiles: string[] = [],
): Promise<string[]> {
  if (depth > maxDepth) {
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

    if (entry.isDirectory()) {
      subdirTasks.push(
        findFilesRecursive(filePath, extensions, depth + 1, maxDepth, allFiles).then(() => undefined),
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
  state.newPaths = state.fsPaths.filter(
    (fsPath) => !state.dbEntries.some((entry) => pathsMatch(String(entry.path), fsPath)),
  )
  state.lostEntries = state.dbEntries.filter(
    (entry) => !state.fsPaths.some((fsPath) => pathsMatch(String(entry.path), fsPath)),
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

  async fullSync(folders: WatchedFolderEntry[]): Promise<WatcherFolderReport[]> {
    this.setFolders(folders)

    for (const folderState of this.folderStates) {
      const folderPath = folderState.folder.path
      const folderTypeIds = folderState.types.map((typeState) => typeState.type.id)
      const mediaRows = await loadMediaForFolder(this.db, folderPath, folderTypeIds)
      const unionExtensions = getUnionExtensions(folderState.folder.types || [])
      const filesInFolder = unionExtensions.length
        ? await findFilesRecursive(folderPath, unionExtensions)
        : []

      for (const typeState of folderState.types) {
        typeState.fsPaths = filesInFolder.filter(
          (filePath) => fileMatchesExtensions(filePath, typeState.extensions),
        )
        typeState.dbEntries = mapMediaRowsToDbEntries(
          mediaRows,
          folderPath,
          typeState.type.id,
        )
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
        )
        recomputeDiff(typeState)
      }
    }

    return this.getReports()
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
}
