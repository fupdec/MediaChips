export type LibraryMergePhase =
  | 'starting'
  | 'mediaTypes'
  | 'meta'
  | 'tags'
  | 'media'
  | 'links'
  | 'playlists'
  | 'marks'
  | 'faces'
  | 'folders'
  | 'filters'
  | 'assets'
  | 'complete'

export type LibraryMergeProgressEvent = {
  type: 'progress'
  phase: LibraryMergePhase | string
  processed: number
  total: number
  current?: string
}

export type LibraryMergeCounts = {
  mediaMatched: number
  mediaCreated: number
  mediaTypesCreated: number
  metaCreated: number
  tagsCreated: number
  linksAdded: number
  playlistsCreated: number
  marksAdded: number
  facesAdded: number
  foldersCreated: number
  filtersCreated: number
  assetsCopied: number
  errors: string[]
}

export type LibraryMergeResult = LibraryMergeCounts & {
  ok: true
  aborted?: boolean
}

export type LibraryMergeProgressCallback = (event: LibraryMergeProgressEvent) => void

export type LibraryMergeOptions = {
  /** Copy generated thumbs/grids/faces/meta images for newly created entities. Default true. */
  copyGeneratedAssets?: boolean
}
