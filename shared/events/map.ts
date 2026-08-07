import type {
  ViewImageEvent,
} from '../api/responses'

export type EventBusMap = {
  'update:watcher': void
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
} & Record<string, unknown>

export type EventBusEvent = keyof EventBusMap

export type EventBusPayload<K extends EventBusEvent> = EventBusMap[K]
