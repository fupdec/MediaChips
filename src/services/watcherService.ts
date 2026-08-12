import uniqBy from 'lodash/uniqBy'
import { typedApi } from '@/services/typedApi'
import type { WatchedFolderLink } from '@shared/entities/watched-folder'
import type { WatchedFolderEntry } from '@/services/watcherUtils'

export async function getWatchedFolders(): Promise<WatchedFolderEntry[]> {
  try {
    const res = await typedApi.getMediaTypesInWatchedFolders()
    const watchedFolders: WatchedFolderLink[] = res.data

    const types: Record<number, WatchedFolderLink['mediaType'][]> = {}

    for (const i of watchedFolders) {
      const id = i.folderId
      if (!types[id]) types[id] = []
      if (i.mediaType) types[id].push(i.mediaType)
    }

    const folders = uniqBy(watchedFolders, (i) => i.folderId)

    return folders.map((i): WatchedFolderEntry => {
      const folder = { ...i.watchedFolder }
      const rawExcluded = folder.excludedPaths
      const excludedPaths = Array.isArray(rawExcluded)
        ? rawExcluded.filter((item): item is string => typeof item === 'string')
        : []
      return {
        ...folder,
        path: String(folder.path ?? ''),
        icon: typeof folder.icon === 'string' ? folder.icon : null,
        excludedPaths,
        types: types[i.folderId] || [],
      }
    })
  } catch (e) {
    console.error('getWatchedFolders error:', e)
    return []
  }
}
