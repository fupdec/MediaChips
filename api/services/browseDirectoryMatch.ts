import path from 'path'
import {isPathInsideMediaRoots} from './mediaRoots'
import {buildPathLookupVariants} from '../utils/normalizeUserPath'

export type BrowseLibraryEntry = {
  path: string
  isDirectory: boolean
  inLibrary: boolean
  addable: boolean
  mediaId: number | null
  extension?: string | null
}

type MediaPathRow = {id: number; path: string}

type MediaRepository = {
  findByPaths(paths: string[], mediaTypeId?: number): MediaPathRow[]
}

export function resolveParentPath(
  currentPath: string,
  rootPath: string | null,
  envValue?: string,
): string | null {
  if (!rootPath) return null
  const normalizedCurrent = path.resolve(currentPath)
  const normalizedRoot = path.resolve(rootPath)
  if (normalizedCurrent === normalizedRoot) return null

  const parent = path.dirname(normalizedCurrent)
  if (parent === normalizedCurrent) return null
  if (!isPathInsideMediaRoots(parent, envValue) && parent !== normalizedRoot) return null
  return parent
}

export function fileExtension(fileName: string): string | null {
  const ext = path.extname(fileName).replace(/^\./, '').toLowerCase()
  return ext || null
}

export function isAddableBrowseFile(
  isFile: boolean,
  extension: string | null,
  allowedExtensions: Set<string>,
): boolean {
  return isFile
    && (!allowedExtensions.size || (extension != null && allowedExtensions.has(extension)))
}

export function markEntriesInLibrary(
  entries: BrowseLibraryEntry[],
  mediaRepo: MediaRepository | null | undefined,
): void {
  if (!mediaRepo) return

  const files = entries.filter((entry) => !entry.isDirectory)
  if (!files.length) return

  const variantToEntry = new Map<string, BrowseLibraryEntry>()
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
