import type { MediaType } from './media'

export interface WatchedFolderLink {
  folderId: number
  mediaTypeId?: number
  mediaType: MediaType | null
  watchedFolder: {
    path: string
    name?: string
    watch?: boolean
    icon?: string | null
    excludedPaths?: string[]
    [key: string]: unknown
  } | null
  [key: string]: unknown
}
