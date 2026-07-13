import type {
  GetItemsFromDbEvent,
  OpenTagsAddWithNamesEvent,
  RemoveEntitiesEvent,
  SetItemsFiltersEvent,
  ViewImageEvent,
} from '../api/responses'
import type { FilterObject } from '../entities/filter'

export type EventBusMap = {
  getMediaTypes: void
  getMediaType: void
  getTags: void | unknown[]
  getMeta: void
  getTabs: void
  getPlaylists: void
  getTag: void
  getItemsFromDb: GetItemsFromDbEvent
  removeEntitiesFromState: RemoveEntitiesEvent
  updatePage: void
  'update:watcher': void
  addMedia: (() => void) | undefined
  updateVideoFrames: number
  applyFilters: void
  setItemsFilters: SetItemsFiltersEvent
  applySavedFilter: FilterObject[] | unknown
  deactivateFilter: number
  deactivateAllFilters: void
  playVideo: unknown
  showDocumentation: string
  showGlobalSearch: void
  openTasksMenu: void
  openRandomItem: number
  openTagsAddWithNames: OpenTagsAddWithNamesEvent | string[] | undefined
  setItemsSortBy: string
  setItemsSortDir: string
  setItemsView: number | string
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
