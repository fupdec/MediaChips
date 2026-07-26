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
  'app:database-changed': void
} & Record<string, unknown>

export type EventBusEvent = keyof EventBusMap

export type EventBusPayload<K extends EventBusEvent> = EventBusMap[K]
