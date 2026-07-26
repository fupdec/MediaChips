import type {
  GetItemsFromDbEvent,
  OpenTagsAddWithNamesEvent,
  RemoveEntitiesEvent,
  SetItemsFiltersEvent,
  ViewImageEvent,
} from '../api/responses'

export type EventBusMap = {
  getMediaTypes: void
  getTags: void | unknown[]
  getMeta: void
  getTabs: void
  getPlaylists: void
  getTag: void
  getItemsFromDb: GetItemsFromDbEvent
  removeEntitiesFromState: RemoveEntitiesEvent
  'update:watcher': void
  addMedia: (() => void) | undefined
  updateVideoFrames: number
  setItemsFilters: SetItemsFiltersEvent
  playVideo: unknown
  showDocumentation: string
  showGlobalSearch: void
  showAddMediaDialog: void
  showKeyboardShortcuts: void
  openTasksMenu: void
  openRandomItem: number
  openTagsAddWithNames: OpenTagsAddWithNamesEvent | string[] | undefined
  setItemsSortBy: string
  setItemsSortDir: string
  setItemsView: number | string
  setItemsGroupBy: string
  setItemsLimit: number
  updateLayoutItems: void
  updateAssignedMeta: void
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
