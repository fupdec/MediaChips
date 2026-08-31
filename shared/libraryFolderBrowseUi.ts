import {normalizeLibraryFolderPath} from './libraryFolderBrowse'

export type FolderBrowseSort = 'name-asc' | 'name-desc' | 'count' | 'date'

export type FolderBrowseFolderRow = {
  path: string
  name: string
  mediaCount: number
  coverMediaIds?: number[]
}

export type FolderBrowseMediaRow = {
  id: number
  name?: string | null
  basename?: string | null
  path?: string | null
  createdAt?: string | null
  duration?: number | null
}

export function canonicalizeFolderTagPath(folderPath: string | null | undefined): string {
  return normalizeLibraryFolderPath(folderPath)
}

/** Paths to query tagsInFolders with — includes slash variants for Windows. */
export function folderTagLookupPaths(folderPath: string | null | undefined): string[] {
  const normalized = canonicalizeFolderTagPath(folderPath)
  if (!normalized) return []
  const paths = new Set<string>([normalized])
  if (normalized.includes('/')) {
    paths.add(normalized.replace(/\//g, '\\'))
  }
  if (normalized.includes('\\')) {
    paths.add(normalized.replace(/\\/g, '/'))
  }
  return [...paths]
}

export function mediaBrowseTitle(item: FolderBrowseMediaRow): string {
  if (item.basename) return String(item.basename)
  if (item.name) return String(item.name)
  const path = String(item.path || '')
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return index >= 0 ? path.slice(index + 1) : path
}

export function matchesFolderBrowseQuery(
  name: string,
  query: string,
): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return name.toLowerCase().includes(needle)
}

export function filterAndSortFolderBrowse<
  F extends FolderBrowseFolderRow,
  M extends FolderBrowseMediaRow,
>(
  folders: F[],
  media: M[],
  options: {query?: string; sort?: FolderBrowseSort} = {},
): {folders: F[]; media: M[]} {
  const query = String(options.query || '')
  const sort = options.sort || 'name-asc'
  const nameFactor = sort === 'name-desc' ? -1 : 1

  const filteredFolders = folders.filter((folder) =>
    matchesFolderBrowseQuery(folder.name, query),
  )
  const filteredMedia = media.filter((item) =>
    matchesFolderBrowseQuery(mediaBrowseTitle(item), query),
  )

  const byName = (a: string, b: string) =>
    a.localeCompare(b, undefined, {sensitivity: 'base'}) * nameFactor

  const nextFolders = [...filteredFolders].sort((a, b) => {
    if (sort === 'count') {
      const delta = (b.mediaCount || 0) - (a.mediaCount || 0)
      if (delta) return delta
    }
    return byName(a.name, b.name)
  })

  const nextMedia = [...filteredMedia].sort((a, b) => {
    if (sort === 'date') {
      const left = String(a.createdAt || '')
      const right = String(b.createdAt || '')
      const delta = right.localeCompare(left)
      if (delta) return delta
    }
    return byName(mediaBrowseTitle(a), mediaBrowseTitle(b))
  })

  return {folders: nextFolders, media: nextMedia}
}

export function mergeCoverMediaIds<T extends FolderBrowseFolderRow>(
  folders: T[],
  covers: Array<{folderKey: string; id: number}>,
): T[] {
  const byKey = new Map<string, number[]>()
  for (const row of covers) {
    const key = canonicalizeFolderTagPath(row.folderKey)
    if (!key || !Number.isFinite(row.id)) continue
    const list = byKey.get(key) || []
    if (list.length >= 4) continue
    list.push(Number(row.id))
    byKey.set(key, list)
  }
  return folders.map((folder) => ({
    ...folder,
    coverMediaIds: byKey.get(canonicalizeFolderTagPath(folder.path)) || folder.coverMediaIds || [],
  }))
}
