import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import {
  findBrowseRootPath,
  isPathInsideMediaRoots,
  SKIP_DIR_NAMES,
} from './mediaRoots'
import {normalizeMediaPath} from '../utils/normalizeUserPath'
import {parseMediaExtensions} from '../utils/mediaExtensions'
import {
  fileExtension,
  isAddableBrowseFile,
  markEntriesInLibrary,
  resolveParentPath,
} from './browseDirectoryMatch'
import {mapInOrderedBatches} from './orderedAsyncBatches'

export type BrowseDirectoryEntry = {
  name: string
  path: string
  isDirectory: boolean
  size: number | null
  /** File/folder last modification time in Unix ms, or null if unavailable. */
  mtimeMs: number | null
  extension: string | null
  inLibrary: boolean
  addable: boolean
  mediaId: number | null
}

export type BrowseDirectoryResult = {
  currentPath: string
  parentPath: string | null
  rootPath: string | null
  truncated: boolean
  platform: NodeJS.Platform
  entries: BrowseDirectoryEntry[]
}

const DEFAULT_ENTRY_LIMIT = 2000
/** Parallel `stat` calls while listing a folder (network disks benefit most). */
export const BROWSE_DIRECTORY_STAT_CONCURRENCY = 16

type MediaPathRow = {id: number; path: string}

type MediaRepository = {
  findByPaths(paths: string[], mediaTypeId?: number): MediaPathRow[]
}

type BrowseCandidate = {
  name: string
  entryPath: string
  isDirectory: boolean
  isFile: boolean
}

function parseExtensions(value: unknown): string[] {
  return parseMediaExtensions(value)
}

export async function listBrowseDirectory(
  rawPath: unknown,
  options: {
    envValue?: string
    extensions?: unknown
    mediaRepo?: MediaRepository | null
    limit?: number
    /** Include names starting with `.` (dotfiles / hidden on Unix). Default false. */
    showHidden?: boolean
    statConcurrency?: number
  } = {},
): Promise<BrowseDirectoryResult> {
  if (typeof rawPath !== 'string' || !rawPath.trim()) {
    throw Object.assign(new Error('Path is required'), {status: 400})
  }

  const currentPath = path.resolve(normalizeMediaPath(rawPath))
  const envValue = options.envValue

  if (!isPathInsideMediaRoots(currentPath, envValue)) {
    throw Object.assign(new Error('Path is outside configured media roots'), {status: 403})
  }

  let stats: fs.Stats
  try {
    stats = await fsp.stat(currentPath)
  } catch {
    throw Object.assign(new Error('Directory not found'), {status: 404})
  }

  if (!stats.isDirectory()) {
    throw Object.assign(new Error('Path is not a directory'), {status: 400})
  }

  const rootPath = findBrowseRootPath(currentPath, envValue)
  const parentPath = resolveParentPath(currentPath, rootPath, envValue)
  const allowedExtensions = new Set(parseExtensions(options.extensions))
  const limit = options.limit ?? DEFAULT_ENTRY_LIMIT
  const showHidden = Boolean(options.showHidden)
  const statConcurrency = Math.max(
    1,
    options.statConcurrency ?? BROWSE_DIRECTORY_STAT_CONCURRENCY,
  )

  let dirents: fs.Dirent[]
  try {
    dirents = await fsp.readdir(currentPath, {withFileTypes: true})
  } catch {
    throw Object.assign(new Error('Unable to read directory'), {status: 403})
  }

  const candidates: BrowseCandidate[] = []
  let truncated = false

  for (const dirent of dirents) {
    if (candidates.length >= limit) {
      truncated = true
      break
    }

    const name = dirent.name
    if (!name) continue
    if (!showHidden && name.startsWith('.')) continue
    if (SKIP_DIR_NAMES.has(name)) continue

    const isDirectory = dirent.isDirectory()
    const isFile = dirent.isFile()
    if (!isDirectory && !isFile) continue

    candidates.push({
      name,
      entryPath: path.join(currentPath, name),
      isDirectory,
      isFile,
    })
  }

  const statsByIndex = await mapInOrderedBatches(
    candidates,
    statConcurrency,
    async (candidate) => {
      try {
        const entryStats = await fsp.stat(candidate.entryPath)
        return {
          size: candidate.isFile ? entryStats.size : null,
          mtimeMs: entryStats.mtimeMs,
        }
      } catch {
        return {size: null, mtimeMs: null}
      }
    },
  )

  const directories: BrowseDirectoryEntry[] = []
  const files: BrowseDirectoryEntry[] = []

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]
    const entryStats = statsByIndex[index] || {size: null, mtimeMs: null}
    const extension = candidate.isFile ? fileExtension(candidate.name) : null
    const addable = isAddableBrowseFile(candidate.isFile, extension, allowedExtensions)

    const entry: BrowseDirectoryEntry = {
      name: candidate.name,
      path: candidate.entryPath,
      isDirectory: candidate.isDirectory,
      size: entryStats.size,
      mtimeMs: entryStats.mtimeMs,
      extension,
      inLibrary: false,
      addable,
      mediaId: null,
    }

    if (candidate.isDirectory) directories.push(entry)
    else files.push(entry)
  }

  directories.sort((a, b) => a.name.localeCompare(b.name))
  files.sort((a, b) => a.name.localeCompare(b.name))

  const entries = [...directories, ...files]
  markEntriesInLibrary(entries, options.mediaRepo)

  return {
    currentPath,
    parentPath,
    rootPath,
    truncated,
    platform: process.platform,
    entries,
  }
}
