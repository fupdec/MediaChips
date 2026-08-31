import {normalizeLibraryFolderPath} from './libraryFolderBrowse'
import {matchesFolderBrowseQuery, mediaBrowseTitle} from './libraryFolderBrowseUi'

export type PresenceFilter = 'all' | 'library' | 'new'

export type DiskFolderInput = {
  path: string
  name: string
}

export type DiskFileInput = {
  path: string
  name: string
  size: number | null
  mtimeMs: number | null
  extension: string | null
  inLibrary: boolean
  addable: boolean
  mediaId: number | null
}

export type LibraryFolderInput = {
  path: string
  name: string
  mediaCount: number
  coverMediaIds?: number[]
}

export type LibraryMediaInput = {
  id: number
  path?: string | null
  name?: string | null
  basename?: string | null
  createdAt?: string | null
}

export type UnifiedFolderRow = {
  path: string
  name: string
  mediaCount: number
  newCount: number
  coverMediaIds?: number[]
}

export type UnifiedPendingFile = {
  name: string
  path: string
  isDirectory: false
  size: number | null
  mtimeMs: number | null
  extension: string | null
  inLibrary: false
  addable: boolean
  mediaId: null
}

export function folderBrowsePathKey(value: string | null | undefined): string {
  return normalizeLibraryFolderPath(value).toLowerCase()
}

export function isPendingDiskFile(file: DiskFileInput): boolean {
  return !file.inLibrary && file.addable && file.mediaId == null
}

export function mergeUnifiedFolderBrowse(input: {
  diskFolders: DiskFolderInput[]
  diskFiles: DiskFileInput[]
  libraryFolders: LibraryFolderInput[]
  libraryMedia: LibraryMediaInput[]
  presence: PresenceFilter
  includeMissing?: boolean
}): {
  folders: UnifiedFolderRow[]
  mediaIds: number[]
  pending: UnifiedPendingFile[]
  missingMediaIds: number[]
} {
  const libraryByPath = new Map<string, LibraryFolderInput>()
  for (const folder of input.libraryFolders) {
    const key = folderBrowsePathKey(folder.path)
    if (!key) continue
    libraryByPath.set(key, folder)
  }

  const mediaByPath = new Map<string, LibraryMediaInput>()
  const mediaById = new Map<number, LibraryMediaInput>()
  for (const item of input.libraryMedia) {
    mediaById.set(item.id, item)
    const key = folderBrowsePathKey(item.path)
    if (key) mediaByPath.set(key, item)
  }

  const diskFileKeys = new Set<string>()
  const mediaIds: number[] = []
  const pending: UnifiedPendingFile[] = []

  for (const file of input.diskFiles) {
    const key = folderBrowsePathKey(file.path)
    if (key) diskFileKeys.add(key)

    const matched = (file.mediaId != null ? mediaById.get(file.mediaId) : null)
      || (key ? mediaByPath.get(key) : null)
      || (file.inLibrary && file.mediaId != null ? {id: file.mediaId} : null)

    if (matched?.id) {
      if (!mediaIds.includes(matched.id)) mediaIds.push(matched.id)
      continue
    }

    if (isPendingDiskFile(file)) {
      pending.push({
        name: file.name,
        path: file.path,
        isDirectory: false,
        size: file.size,
        mtimeMs: file.mtimeMs,
        extension: file.extension,
        inLibrary: false,
        addable: file.addable,
        mediaId: null,
      })
    }
  }

  const missingMediaIds: number[] = []
  if (input.includeMissing) {
    for (const item of input.libraryMedia) {
      const key = folderBrowsePathKey(item.path)
      if (!key || diskFileKeys.has(key)) continue
      if (!mediaIds.includes(item.id) && !missingMediaIds.includes(item.id)) {
        missingMediaIds.push(item.id)
      }
    }
  }

  const folders: UnifiedFolderRow[] = input.diskFolders.map((folder) => {
    const overlay = libraryByPath.get(folderBrowsePathKey(folder.path))
    return {
      path: folder.path,
      name: folder.name,
      mediaCount: overlay?.mediaCount || 0,
      newCount: 0,
      coverMediaIds: overlay?.coverMediaIds || [],
    }
  })

  if (input.presence === 'library') {
    return {
      folders: folders.filter((folder) => folder.mediaCount > 0),
      mediaIds,
      pending: [],
      missingMediaIds,
    }
  }

  if (input.presence === 'new') {
    return {
      folders: [],
      mediaIds: [],
      pending,
      missingMediaIds: [],
    }
  }

  return {folders, mediaIds, pending, missingMediaIds}
}

export function filterUnifiedPendingFiles<T extends {name: string}>(
  files: T[],
  query?: string,
): T[] {
  return files.filter((file) => matchesFolderBrowseQuery(file.name, query || ''))
}

export function sortUnifiedPendingFiles<T extends {name: string; mtimeMs?: number | null}>(
  files: T[],
  sort: 'name-asc' | 'name-desc' | 'count' | 'date' = 'name-asc',
): T[] {
  const nameFactor = sort === 'name-desc' ? -1 : 1
  return [...files].sort((a, b) => {
    if (sort === 'date') {
      return (b.mtimeMs || 0) - (a.mtimeMs || 0)
    }
    return a.name.localeCompare(b.name, undefined, {sensitivity: 'base'}) * nameFactor
  })
}

export function filterUnifiedMediaByIds<T extends LibraryMediaInput>(
  media: T[],
  ids: number[],
): T[] {
  if (!ids.length) return []
  const order = new Map(ids.map((id, index) => [id, index]))
  return media
    .filter((item) => order.has(item.id))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
}

export {mediaBrowseTitle}
