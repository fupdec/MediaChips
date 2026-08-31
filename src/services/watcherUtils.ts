import type { MediaType } from '@/types/media'
import type { WatchedFolderLink } from '@shared/entities/watched-folder'

export interface WatchedFolderEntry {
  path: string
  name?: string
  types: MediaType[]
  watch?: boolean | number
  id?: number
  folderId?: number
  icon?: string | null
  excludedPaths?: string[]
}

export function isFolderWatchEnabled(folder: WatchedFolderEntry): boolean {
  return folder.watch !== false && folder.watch !== 0
}

export function getActiveWatchedFolders(folders: WatchedFolderEntry[]): WatchedFolderEntry[] {
  return folders.filter(isFolderWatchEnabled)
}

export function groupWatchedFolderLinks(links: WatchedFolderLink[]): WatchedFolderEntry[] {
  const typesByFolderId = new Map<number, MediaType[]>()
  const foldersById = new Map<number, WatchedFolderLink>()

  for (const link of links) {
    const folderId = Number(link.folderId)
    if (!link.watchedFolder || !Number.isFinite(folderId) || folderId <= 0) continue

    if (!foldersById.has(folderId)) foldersById.set(folderId, link)

    const types = typesByFolderId.get(folderId) ?? []
    if (link.mediaType) types.push(link.mediaType)
    typesByFolderId.set(folderId, types)
  }

  return [...foldersById.values()].map((link): WatchedFolderEntry => {
    const folder = link.watchedFolder!
    const rawExcluded = folder.excludedPaths
    const excludedPaths = Array.isArray(rawExcluded)
      ? rawExcluded.filter((item): item is string => typeof item === 'string')
      : []
    const id = Number(link.folderId)
    return {
      ...folder,
      path: String(folder.path ?? ''),
      icon: typeof folder.icon === 'string' ? folder.icon : null,
      excludedPaths,
      types: typesByFolderId.get(id) || [],
    }
  })
}

export function getWatchedFoldersExtensions(watchedFolders: WatchedFolderEntry[]) {
  const ext: Record<string, string[]> = {}

  watchedFolders.forEach((folder) => {
    let arr: string[] = []
    folder.types.forEach((type) => {
      arr = arr.concat((type.extensions || '').split(','))
    })
    ext[folder.path] = arr
  })

  return ext
}
