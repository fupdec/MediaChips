import type {
  ViewImageEvent,
} from '../api/responses'

export type EventBusMap = {
  'update:watcher': void
  'rescan:watcher': void
  addMedia: (() => void) | undefined
  updateVideoFrames: number
  playVideo: unknown
  scrollToNowPlaying: void
  updateMarkImage: number | string
  refreshMarkThumbs: void
  viewImage: ViewImageEvent
  transferScrapedInfo: void
  transferSceneScrapedInfo: void
  scraperGotImages: void
  camgirlFinderApplied: {
    faceIds?: number[]
    tagId?: number
    mediaId?: number | null
  }
  'tagsAdd:completed': {
    names?: string[]
    createdNames?: string[]
    mediaIds?: number[]
    assigned?: boolean
    applied?: number
  }
  'app:database-changed': void
  'library:nav-counts-changed': void
  'markers:reload': void
  'playlists:reload': void
  'folders:go-up': void
  'folders:history-back': void
  'folders:history-forward': void
  'folders:open-path': string
  'folders:open-tags': void
  'folders:pending-add': string
  'folders:pending-edit': string
  'folders:pending-play': string
} & Record<string, unknown>

export type EventBusEvent = keyof EventBusMap

export type EventBusPayload<K extends EventBusEvent> = EventBusMap[K]
