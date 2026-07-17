import type { ComputedRef, Ref } from 'vue'
import type { AxiosResponse } from 'axios'
import type {
  GetItemsFromDbEvent,
  ItemsPageListQuery,
  MediaListResponseData,
  PageSettingData,
  PageSettingsRecord,
  RemoveEntitiesEvent,
} from '@shared/api/responses'
import type { FilterObject } from '@/types/common'
import type { MediaType } from '@/types/media'
import type { AssignedMeta, MediaItem, Meta, SavedFilter, Tag } from '@/types/stores'
import type { ItemsGroupBy, ItemsGroupSummary } from '@/utils/itemsGroupBy'

export type ItemsPageType = 'media' | 'tag'

export type {
  GetItemsFromDbEvent,
  ItemsPageListQuery,
  MediaListResponseData,
  PageSettingData,
  PageSettingsRecord,
  RemoveEntitiesEvent,
}

export interface ItemsPageProps {
  items_type: ItemsPageType | string
  tagId?: number
  mediaTypeId?: number
  metaId?: number
  tabId?: number
}

export interface ItemsPageLoader {
  show: boolean
  timeout: ReturnType<typeof setTimeout> | number
  is_busy: boolean
}

export type MediaListResponse = AxiosResponse<MediaListResponseData>

export interface ItemsPageInitDeps {
  disposeListFetching: () => void
  resetMediaListState: () => void
  getItemsFromDb: (ids?: number[]) => Promise<void>
}

export interface UseItemsPageOptions {
  props: ItemsPageProps
  mediaType: Ref<MediaType | null>
  container: Ref<HTMLElement | null>
  updatePageSetting: (data: PageSettingData) => Promise<void>
}

export interface UseItemsPageInitOptions {
  props: ItemsPageProps
  mediaType: Ref<MediaType | null>
  meta: Ref<Meta | null>
}

export interface UseItemsPageEventsOptions {
  props: ItemsPageProps
  mediaType: Ref<MediaType | null>
  meta: Ref<Meta | null>
  loader: Ref<ItemsPageLoader>
  total: Ref<number>
  totalInDb: Ref<number>
  is_infinite_scroll: ComputedRef<boolean>
  init: () => Promise<void>
  loadSavedFilters: () => void
  updatePageSetting: (data: PageSettingData) => Promise<void>
  getFilters: () => Promise<void>
  getPinnedMeta: () => Promise<void>
  getItemsFromDb: (ids?: number[]) => Promise<void>
  getEntitiesOnPage: (ids_remove?: number[]) => void
  bindMediaInfiniteScroll: () => void
  unbindMediaInfiniteScroll: () => void
  disposeListFetching: () => void
  maybeLoadMoreIfNearBottom: () => void
  refreshScrollRoot: () => Element | null
  loadNextInfinitePage: () => Promise<void>
}

export interface InfiniteIntersectOptions {
  handler: (isIntersecting: boolean) => void
  options: {
    root: Element | null
    rootMargin: string
    threshold: number
  }
}

export interface ItemContextMenuEntry {
  name?: string
  type: string
  icon?: string
  color?: string
  disabled?: boolean
  action?: (...args: unknown[]) => unknown
  menu?: ItemContextMenuEntry[]
  [key: string]: unknown
}

export interface PresetMetaProps {
  item: MediaItem | Tag
  type: ItemsPageType | string
  isShowAll?: boolean
}

export interface PresetMetaParam {
  name: string
  text: string
  icon: string
  types: string[]
  media_types?: string[]
  show?: boolean
  value?: unknown
}

export interface MarkWithMedium {
  id: number
  mediaId?: number
  medium?: {
    id?: number
    path?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

import type { WatchedFolderEntry } from '@/services/watcherUtils'

export interface WatcherWsPayload {
  type: string
  folders?: WatchedFolderEntry[]
  extensions?: Record<string, unknown>
}

export interface ItemsPageStoreUpdates {
  type?: string
  isFiltersLoaded?: boolean
  itemsOnPage?: MediaItem[]
  entities?: MediaItem[]
  navigationItems?: MediaItem[]
  totalFiltered?: number
  meta?: Meta
  name?: string
  icon?: string
  filters?: FilterObject[]
  savedFilter?: SavedFilter
  assigned?: AssignedMeta[]
  page?: number
  limit?: number
  size?: number
  view?: number | string
  groupBy?: ItemsGroupBy | string
  groupByMetaId?: number | null
  groups?: ItemsGroupSummary[]
  sortBy?: string
  sortDir?: string
  [key: string]: unknown
}
