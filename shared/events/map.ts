import type {
  GetItemsFromDbEvent,
  OpenTagsAddWithNamesEvent,
  RemoveEntitiesEvent,
  ViewImageEvent,
} from '../api/responses'

export type EventBusMap = {
  getTag: void
  getItemsFromDb: GetItemsFromDbEvent
  removeEntitiesFromState: RemoveEntitiesEvent
  'update:watcher': void
  addMedia: (() => void) | undefined
  updateVideoFrames: number
  playVideo: unknown
  showDocumentation: string
  showGlobalSearch: void
  showAddMediaDialog: void
  showKeyboardShortcuts: void
  openTasksMenu: void
  openTagsAddWithNames: OpenTagsAddWithNamesEvent | string[] | undefined
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
