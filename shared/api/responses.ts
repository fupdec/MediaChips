import type { FilterObject } from '../entities/filter'
import type { MediaItem } from '../entities/media'
import type { MediaType } from '../entities/media'
import type { Meta, Tag } from '../entities/meta'
import type { Playlist } from '../entities/playlist'
import type { Tab } from '../entities/tab'
import type { SavedFilter } from '../entities/filter'
import type { AssignedMeta } from '../entities/meta'
import type { ItemsGroupSummary } from '../itemsGroupBy'

export interface SettingEntry {
  option: string
  value: string
}

export interface MediaListResponseData {
  items?: MediaItem[]
  totalFiltered?: number
  totalFilesize?: number
  total?: number
  pages?: number
  page?: number
  limit?: number
  navigation?: MediaItem[]
  groups?: ItemsGroupSummary[]
}

export interface PageSettingData {
  page?: number
  limit?: number
  size?: number
  view?: number | string
  sortBy?: string
  sortDir?: string
  firstChar?: string
  filterId?: number
  query?: unknown
}

export interface PageSettingsRecord extends PageSettingData {
  [key: string]: unknown
}

export interface PageSettingWritePayload {
  data: PageSettingData
  query: {
    tagId?: number
    mediaTypeId?: number
    metaId?: number
    tabId?: number
  }
}

export interface HomeMediaResponse {
  continueWatching?: MediaItem[]
  favorites?: MediaItem[]
  topViews?: MediaItem[]
  items?: MediaItem[]
  [key: string]: unknown
}

export interface ApiBootstrapLists {
  mediaTypes: MediaType[]
  tags: Tag[]
  meta: Meta[]
  tabs: Tab[]
  playlists: Playlist[]
}

export interface ItemsListRequest {
  metaId?: number
  mediaTypeId?: number
  filters?: FilterObject[]
  sortBy?: string
  direction?: string
  find_duplicates?: boolean
  duplicates_by?: string
  ids?: number[]
  includeNavigation?: boolean
  page?: number
  limit?: number
  skipTotals?: boolean
  /** Serialized group-by setting, e.g. `firstLetter` or `pinnedMeta:42`. */
  groupBy?: string
  /** Tag autocomplete / name+synonym search. */
  search?: string
  query?: string
}

export type ItemsPageListQuery = ItemsListRequest

export interface GetItemsFromDbEvent {
  ids?: Array<number | string | undefined>
  type: string
  /** Optional partial fields to apply immediately (before refetch). */
  patch?: Record<string, unknown>
}

export interface RemoveEntitiesPayload {
  ids: number[]
  type: string
}

export type RemoveEntitiesEvent =
  | RemoveEntitiesPayload
  | { detail: RemoveEntitiesPayload }

export interface SetItemsFiltersEvent {
  filters: FilterObject[]
}

export interface ViewImageEvent {
  src?: string
  path?: string
  name?: string
  [key: string]: unknown
}

export interface OpenTagsAddWithNamesEvent {
  names?: string[]
  [key: string]: unknown
}

export interface SavedFilterFindAllRequest {
  mediaTypeId?: number | null
  metaId?: number | null
  tagId?: number | null
  tabId?: number | null
}

export interface FilterRowInSavedFilter {
  filterRow?: FilterObject & Record<string, unknown>
}

export interface TagInFilterRow {
  tagId: number
}

export interface TagInTagEntry {
  metaId: number
  tagId: number
}

export interface ValueInTagEntry {
  metaId: number
  value: unknown
}

export interface PinnedMetaLink {
  metaId: number
  pinnedMetaId?: number
}

export interface MarkForVideo {
  id?: number
  type: string
  time: number
  end?: number | null
  mediaId?: number
  metaId?: number
  text?: string
  name?: string
  meta?: { id?: number; icon?: string; [key: string]: unknown }
  tag?: { name?: string; color?: string; metaId?: number; [key: string]: unknown }
  [key: string]: unknown
}

export interface MarkClipItem {
  id: number
  markId: number
  path?: string
  name?: string
  basename?: string
  mediaTypeId?: number
  segmentStart: number
  segmentEnd: number
  time?: number
  [key: string]: unknown
}

export interface MarkClipsResponse {
  items: MarkClipItem[]
  count: number
}

export interface DynamicPlaylistSummary {
  id: number
  count?: number | null
  previewIds?: number[]
  [key: string]: unknown
}

export interface SavedFilterMediaResponse {
  items?: MediaItem[]
  count?: number
}

export interface SavedFilterSummaryResponse {
  count?: number
  previewIds?: number[]
}

export interface MediaIdsResponse {
  ids?: number[]
}

export interface DatabaseSizesResponse {
  sizes?: Record<string, number>
}

export interface BackupEntry {
  date: string
  size?: number | string
  name?: string
  path?: string
}

export interface MediaPathFile {
  id: number
  path?: string
  [key: string]: unknown
}

export interface AddMediaResponse {
  id?: number
  message?: string
  duplicate?: {
    parameter?: string
    path?: string
    id?: number
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface ParsePathTagEntry {
  mediaId: number
  path?: string
  tagId?: number
  metaId?: number
  [key: string]: unknown
}

export interface RemoveTagFromItemPayload {
  tagId: number
  mediaId?: number
  parentTagId?: number
}

export interface DeleteEntityOnePayload {
  id: number
  metaId?: number | null
  with_file?: boolean
  path?: string | null
  type?: string | null
  [key: string]: unknown
}

export interface MergeTagsResult {
  survivor: {
    id: number
    name: string
    synonyms?: string | null
    metaId?: number | null
    [key: string]: unknown
  }
  deletedIds: number[]
  migrated: {
    mediaLinks: number
    nestedAsChild: number
    nestedAsParent: number
    nestedNameDeduped: number
    filterRows: number
    values: number
    marks: number
    tabs: number
    savedFilters: number
    pageSettings: number
  }
}

export interface MergeCategoriesResult {
  survivor: {
    id: number
    name?: string | null
    type?: string | null
    [key: string]: unknown
  }
  deletedIds: number[]
  autoMergedTagIds: number[]
  migrated: {
    tags: number
    mediaLinks: number
    nestedLinks: number
    filterRows: number
    filterRowTags: number
    tabs: number
    savedFilters: number
    pageSettings: number
    mediaTypeAssignments: number
    pinnedFields: number
    autoMergedTagPairs: number
  }
}

export interface WatchedFolderUpdatePayload {
  path?: string
  name?: string
  watch?: boolean
  [key: string]: unknown
}

export interface WatchedFolderCreatePayload {
  folder: {
    path: string
    name?: string
    watch?: boolean
    [key: string]: unknown
  }
  types: number[]
  [key: string]: unknown
}

export interface VideoTimelineTaskPayload {
  id: number
  path?: string
  [key: string]: unknown
}

export interface EntityUpdatePayload {
  name?: string | null
  color?: string | null
  synonyms?: string | null
  rating?: number
  favorite?: number | boolean
  views?: number
  bookmark?: string | null
  country?: string | null
  viewedAt?: string
  silent?: boolean
  [key: string]: unknown
}

export interface FileExistsResponse {
  exists?: boolean
}

export interface ResolvePathResponse {
  exists?: boolean
}

export type { AssignedMeta, SavedFilter }
