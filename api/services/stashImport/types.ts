export type StashEntityKind = 'performer' | 'studio' | 'tag' | 'scene'

export interface StashPerformer {
  id: number
  name: string
  country: string | null
  favorite: boolean
  rating: number | null
  aliases: string[]
}

export interface StashStudio {
  id: number
  name: string
  favorite: boolean
  rating: number | null
  aliases: string[]
}

export interface StashTag {
  id: number
  name: string
  favorite: boolean
  aliases: string[]
}

export interface StashSceneMarker {
  id: number
  sceneId: number
  title: string
  seconds: number
  endSeconds: number | null
  primaryTagId: number | null
}

export interface StashScene {
  id: number
  title: string | null
  rating: number | null
  studioId: number | null
  path: string | null
  filesize: number
  oshash: string | null
  contentHash: string | null
  views: number
  viewedAt: string | null
  duration: number | null
  width: number | null
  height: number | null
  bitrate: number | null
  fps: number | null
  codec: string | null
  performerIds: number[]
  tagIds: number[]
  markers: StashSceneMarker[]
}

export interface StashLibrarySnapshot {
  performers: StashPerformer[]
  studios: StashStudio[]
  tags: StashTag[]
  scenes: StashScene[]
}

export interface StashImportOptions {
  /** When false, only update media already present in MediaChips. Default true. */
  createMissingMedia?: boolean
}

export interface StashImportProgressEvent {
  type: 'progress'
  phase: string
  processed: number
  total: number
  current?: string
}

export interface StashImportCounts {
  performers: number
  studios: number
  tags: number
  mediaCreated: number
  mediaMatched: number
  mediaUpdated: number
  mediaSkipped: number
  links: number
  markers: number
  errors: string[]
}

export interface StashImportResult extends StashImportCounts {
  ok: true
}

export type StashImportProgressCallback = (event: StashImportProgressEvent) => void
