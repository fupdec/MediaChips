import { typedApi } from '@/services/typedApi'
import { groupWatchedFolderLinks, type WatchedFolderEntry } from '@/services/watcherUtils'

export async function getWatchedFolders(): Promise<WatchedFolderEntry[]> {
  try {
    const res = await typedApi.getMediaTypesInWatchedFolders()
    return groupWatchedFolderLinks(res.data)
  } catch (e) {
    console.error('getWatchedFolders error:', e)
    return []
  }
}
