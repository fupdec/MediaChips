import {getItemDiskRoot, getItemParentPath} from './itemsGroupBy'
import {isVirtualZipPath} from './zipPath'

/** Normalize media/folder paths for library browse (forward slashes, no trailing slash). */
export function normalizeLibraryFolderPath(value: string | null | undefined): string {
  let normalized = String(value ?? '').trim().replace(/\\/g, '/')
  if (!normalized) return ''

  // Keep Windows drive root as `C:/` (not `C:`).
  const driveRoot = /^([a-zA-Z]:)\/?$/.exec(normalized)
  if (driveRoot) return `${driveRoot[1].toUpperCase()}/`

  // UNC `//server/share` — keep leading double slash.
  if (normalized.startsWith('//')) {
    normalized = `//${normalized.slice(2).replace(/\/+$/, '')}`
    return normalized || '//'
  }

  if (normalized !== '/') {
    normalized = normalized.replace(/\/+$/, '')
  }
  return normalized
}

export function isLibraryBrowseZipPath(path: string | null | undefined): boolean {
  return isVirtualZipPath(path)
}

export function libraryFolderParentPath(folderPath: string | null | undefined): string | null {
  const normalized = normalizeLibraryFolderPath(folderPath)
  if (!normalized || normalized === '/') return null

  const diskRoot = normalizeLibraryFolderPath(getItemDiskRoot(normalized))
  if (diskRoot && diskRoot !== '#' && normalized === diskRoot) return null

  const parent = getItemParentPath(normalized)
  if (!parent || parent === '#') return null
  return normalizeLibraryFolderPath(parent)
}

export type LibraryFolderBreadcrumb = {
  path: string
  name: string
}

/** Breadcrumbs from disk root down to `folderPath` (inclusive). */
export function buildLibraryFolderBreadcrumbs(
  folderPath: string | null | undefined,
): LibraryFolderBreadcrumb[] {
  const normalized = normalizeLibraryFolderPath(folderPath)
  if (!normalized) return []

  const crumbs: LibraryFolderBreadcrumb[] = []
  let current: string | null = normalized
  const guard = new Set<string>()

  while (current && !guard.has(current)) {
    guard.add(current)
    crumbs.push({
      path: current,
      name: libraryFolderDisplayName(current),
    })
    current = libraryFolderParentPath(current)
  }

  crumbs.reverse()
  return crumbs
}

export function libraryFolderDisplayName(folderPath: string | null | undefined): string {
  const normalized = normalizeLibraryFolderPath(folderPath)
  if (!normalized) return ''

  const driveRoot = /^([a-zA-Z]:)\/$/.exec(normalized)
  if (driveRoot) return driveRoot[1].toUpperCase()

  if (normalized === '/') return '/'

  const unc = /^\/\/([^/]+)\/([^/]+)$/.exec(normalized)
  if (unc) return `\\\\${unc[1]}\\${unc[2]}`

  const index = normalized.lastIndexOf('/')
  if (index < 0) return normalized
  if (index === 0) return normalized.slice(1) || '/'
  return normalized.slice(index + 1)
}

/**
 * Immediate child folder path under `folderPath` for a media file path, or null
 * when the file is a direct child (or not under the folder).
 */
export function immediateChildFolderPath(
  folderPath: string | null | undefined,
  mediaPath: string | null | undefined,
): string | null {
  const folder = normalizeLibraryFolderPath(folderPath)
  const file = normalizeLibraryFolderPath(mediaPath)
  if (!folder || !file || isLibraryBrowseZipPath(mediaPath)) return null

  const prefix = folder.endsWith('/') ? folder : `${folder}/`
  if (!file.startsWith(prefix)) return null

  const relative = file.slice(prefix.length)
  const sep = relative.indexOf('/')
  if (sep <= 0) return null

  const childName = relative.slice(0, sep)
  if (!childName) return null
  return normalizeLibraryFolderPath(`${folder}/${childName}`)
}

/** True when `mediaPath` is a direct file child of `folderPath` (not nested deeper). */
export function isDirectLibraryFolderChild(
  folderPath: string | null | undefined,
  mediaPath: string | null | undefined,
): boolean {
  const folder = normalizeLibraryFolderPath(folderPath)
  const file = normalizeLibraryFolderPath(mediaPath)
  if (!folder || !file || isLibraryBrowseZipPath(mediaPath)) return false

  const parent = normalizeLibraryFolderPath(getItemParentPath(file))
  return parent === folder
}
