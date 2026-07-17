export type JellyfinOldIdPrefix = 'jellyfin' | 'emby'

export interface JellyfinLibraryInfo {
  id: string
  name: string
  collectionType?: string | null
}

export interface JellyfinPerson {
  id: string
  name: string
}

export interface JellyfinGenre {
  id: string
  name: string
}

export interface JellyfinStudio {
  id: string
  name: string
}

export interface JellyfinSeries {
  id: string
  name: string
}

export interface JellyfinChapter {
  name: string | null
  startSeconds: number
}

export interface JellyfinMediaItem {
  id: string
  name: string
  path: string | null
  type: string
  seriesId: string | null
  filesize: number | null
  duration: number | null
  width: number | null
  height: number | null
  bitrate: number | null
  codec: string | null
  /** 0–10 community rating from Jellyfin */
  communityRating: number | null
  playCount: number
  lastPlayedDate: string | null
  personIds: string[]
  genreIds: string[]
  studioIds: string[]
  chapters: JellyfinChapter[]
}

export interface JellyfinLibrarySnapshot {
  people: JellyfinPerson[]
  genres: JellyfinGenre[]
  studios: JellyfinStudio[]
  series: JellyfinSeries[]
  items: JellyfinMediaItem[]
}

export interface JellyfinImportOptions {
  baseUrl: string
  apiKey: string
  libraryIds?: string[]
  createMissingMedia?: boolean
  /** Defaults to jellyfin */
  oldIdPrefix?: JellyfinOldIdPrefix
}

export interface JellyfinImportProgressEvent {
  type: 'progress'
  phase: string
  processed: number
  total: number
  current?: string
}

export type JellyfinImportProgressCallback = (event: JellyfinImportProgressEvent) => void

export interface JellyfinImportCounts {
  people: number
  genres: number
  studios: number
  series: number
  mediaCreated: number
  mediaMatched: number
  mediaUpdated: number
  mediaSkipped: number
  links: number
  markers: number
  errors: string[]
}

export interface JellyfinImportResult extends JellyfinImportCounts {
  ok: true
}
