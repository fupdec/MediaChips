export interface PlexLibraryInfo {
  id: string
  name: string
  type: string | null
}

export interface PlexNamedEntity {
  id: string
  name: string
}

export interface PlexChapter {
  name: string | null
  startSeconds: number
}

export interface PlexMediaItem {
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
  rating: number | null
  playCount: number
  lastPlayedDate: string | null
  personIds: string[]
  genreIds: string[]
  studioIds: string[]
  chapters: PlexChapter[]
}

export interface PlexLibrarySnapshot {
  people: PlexNamedEntity[]
  genres: PlexNamedEntity[]
  studios: PlexNamedEntity[]
  series: PlexNamedEntity[]
  items: PlexMediaItem[]
}

export interface PlexImportOptions {
  baseUrl: string
  token: string
  libraryIds?: string[]
  createMissingMedia?: boolean
}

export interface PlexImportProgressEvent {
  type: 'progress'
  phase: string
  processed: number
  total: number
  current?: string
}

export type PlexImportProgressCallback = (event: PlexImportProgressEvent) => void

export interface PlexImportCounts {
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

export interface PlexImportResult extends PlexImportCounts {
  ok: true
}
