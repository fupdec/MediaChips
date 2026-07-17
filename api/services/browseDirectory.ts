import fs from 'fs'
import path from 'path'
import {
  findBrowseRootPath,
  isPathInsideMediaRoots,
  SKIP_DIR_NAMES,
} from './mediaRoots'
import {buildPathLookupVariants, normalizeMediaPath} from '../utils/normalizeUserPath'

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

type MediaPathRow = {id: number; path: string}

type MediaRepository = {
  findByPaths(paths: string[], mediaTypeId?: number): MediaPathRow[]
}

function parseExtensions(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim().toLowerCase().replace(/^\./, '')).filter(Boolean)
  }
  if (typeof value !== 'string' || !value.trim()) return []
  return value
    .split(',')
    .map((item) => item.trim().toLowerCase().replace(/^\./, ''))
    .filter(Boolean)
}

function resolveParentPath(currentPath: string, rootPath: string | null, envValue?: string): string | null {
  if (!rootPath) return null
  const normalizedCurrent = path.resolve(currentPath)
  const normalizedRoot = path.resolve(rootPath)
  if (normalizedCurrent === normalizedRoot) return null

  const parent = path.dirname(normalizedCurrent)
  if (parent === normalizedCurrent) return null
  if (!isPathInsideMediaRoots(parent, envValue) && parent !== normalizedRoot) return null
  return parent
}

function fileExtension(fileName: string): string | null {
  const ext = path.extname(fileName).replace(/^\./, '').toLowerCase()
  return ext || null
}

export function listBrowseDirectory(
  rawPath: unknown,
  options: {
    envValue?: string
    extensions?: unknown
    mediaRepo?: MediaRepository | null
    limit?: number
    /** Include names starting with `.` (dotfiles / hidden on Unix). Default false. */
    showHidden?: boolean
  } = {},
): BrowseDirectoryResult {
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
    stats = fs.statSync(currentPath)
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

  let dirents: fs.Dirent[]
  try {
    dirents = fs.readdirSync(currentPath, {withFileTypes: true})
  } catch {
    throw Object.assign(new Error('Unable to read directory'), {status: 403})
  }

  const directories: BrowseDirectoryEntry[] = []
  const files: BrowseDirectoryEntry[] = []
  let truncated = false

  for (const dirent of dirents) {
    if (directories.length + files.length >= limit) {
      truncated = true
      break
    }

    const name = dirent.name
    if (!name) continue
    if (!showHidden && name.startsWith('.')) continue
    if (SKIP_DIR_NAMES.has(name)) continue

    const entryPath = path.join(currentPath, name)
    const isDirectory = dirent.isDirectory()
    const isFile = dirent.isFile()
    if (!isDirectory && !isFile) continue

    let size: number | null = null
    let mtimeMs: number | null = null
    try {
      const entryStats = fs.statSync(entryPath)
      mtimeMs = entryStats.mtimeMs
      if (isFile) size = entryStats.size
    } catch {
      size = null
      mtimeMs = null
    }

    const extension = isFile ? fileExtension(name) : null
    const addable = isFile
      && (!allowedExtensions.size || (extension != null && allowedExtensions.has(extension)))

    const entry: BrowseDirectoryEntry = {
      name,
      path: entryPath,
      isDirectory,
      size,
      mtimeMs,
      extension,
      inLibrary: false,
      addable,
      mediaId: null,
    }

    if (isDirectory) directories.push(entry)
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

function markEntriesInLibrary(
  entries: BrowseDirectoryEntry[],
  mediaRepo: MediaRepository | null | undefined,
): void {
  if (!mediaRepo) return

  const files = entries.filter((entry) => !entry.isDirectory)
  if (!files.length) return

  const variantToEntry = new Map<string, BrowseDirectoryEntry>()
  const lookupPaths: string[] = []

  for (const entry of files) {
    for (const variant of buildPathLookupVariants(entry.path)) {
      if (!variantToEntry.has(variant)) {
        variantToEntry.set(variant, entry)
        lookupPaths.push(variant)
      }
    }
  }

  // Path is globally unique in media table — do not filter by mediaTypeId.
  const found = mediaRepo.findByPaths(lookupPaths)

  const variantToEntryLower = new Map(
    [...variantToEntry.entries()].map(([variant, entry]) => [variant.toLowerCase(), entry]),
  )

  for (const row of found) {
    const dbPath = String(row.path || '')
    const entry = variantToEntry.get(dbPath) || variantToEntryLower.get(dbPath.toLowerCase())
    if (!entry) continue
    entry.inLibrary = true
    entry.addable = false
    entry.mediaId = row.id
  }
}
