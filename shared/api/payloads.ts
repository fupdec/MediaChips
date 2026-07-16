import type { FilterObject } from '../entities/filter'
import type { MediaType } from '../entities/media'
import type { ItemsListRequest, ParsePathTagEntry } from './responses'

export interface TabCreatePayload {
  name?: string
  icon?: string
  url?: string
  tagId?: number | null
  metaId?: number | null
  mediaTypeId?: number | null
  [key: string]: unknown
}

export type TabUpdatePayload = Partial<TabCreatePayload>

export interface AddMediaPayload {
  path: string
  type?: string | number | MediaType
  is_check_duplicates?: boolean
  [key: string]: unknown
}

export interface MediaTypeWritePayload {
  name?: string
  extensions?: string
  icon?: string
  hidden?: boolean | number
  order?: number
  custom?: boolean
  [key: string]: unknown
}

export interface CreateTagPayload {
  name: string
  metaId?: number
  color?: string
  synonyms?: string
  [key: string]: unknown
}

export interface ParsePathTagsPayload {
  paths: Array<{ path?: string; mediaId: number }>
}

export type CreateTagsInMediaOnePayload = {
  mediaId?: number
  tagId?: number | string
  metaId?: number | string
  path?: string
  data?: ParsePathTagEntry
  [key: string]: unknown
}

export interface FilterTagsPayload {
  metaId?: number
  page?: number
  limit?: number
  sortBy?: string
  sortDir?: string
  filters?: FilterObject[]
  query?: string
  [key: string]: unknown
}

export interface PostTagItemsPayload {
  metaId?: number
  tagId?: number
  mediaId?: number
  filters?: FilterObject[]
  [key: string]: unknown
}

export interface PinMetaAssignmentPayload {
  metaId: number
  mediaTypeId: number
  order?: number
}

export interface PinChildMetaPayload {
  metaId: number
  pinnedMetaId: number
  order?: number
}

export interface MetaAssignmentOrderPayload {
  metaId: number
  mediaTypeId?: number
  pinnedMetaId?: number
  data: { order: number }
}

export interface MetaAssignmentUpdatePayload {
  metaId?: number | null
  mediaTypeId?: number | null
  pinnedMetaId?: number | null
  order?: number
  show?: number | boolean
  [key: string]: unknown
}

export interface CreateThumbPayload {
  timestamp: number
  inputPath: string
  outputPath: string
  width: number
  overwrite?: boolean
}

export interface CreateImagePayload {
  image: string
  outputPath: string
  url?: string | null
  sizes: unknown
}

export interface CreateMarkThumbPayload {
  markId: number
  inputPath?: string
  outputPath?: string
  [key: string]: unknown
}

export interface VideoPreviewTaskPayload {
  id?: number
  path?: string
  input?: string
  output?: string
  width?: number
  cols?: number
  rows?: number
  seekRatio?: number
  [key: string]: unknown
}

export interface GetFileBlobPayload {
  path?: string
  url?: string
  outside?: boolean
  _t?: number
  [key: string]: unknown
}

export interface GetFileListPayload {
  path: string
  [key: string]: unknown
}

export interface SearchMediaByPathPayload {
  path?: string
  query?: string
  mediaTypeId?: number
  [key: string]: unknown
}

export interface UpdateMediaMultiplePayload {
  ids?: number[]
  mediaFiles?: Array<{ id: number; path: string; [key: string]: unknown }>
  data?: Record<string, unknown>
  [key: string]: unknown
}

export interface DatabaseSizesPayload {
  [key: string]: unknown
}

export interface FolderSizePayload {
  path?: string
  folder?: string
  [key: string]: unknown
}

export interface BackupNamePayload {
  name?: string
  path?: string
  [key: string]: unknown
}

export interface CreateFilterRowPayload {
  filter: FilterObject
  filterId?: number | null
  rowId?: number | null
  savedFilterId?: number
  [key: string]: unknown
}

export interface CreateSavedFilterPayload {
  name: string
  mediaTypeId?: number | null
  metaId?: number | null
  tagId?: number | null
  tabId?: number | null
  [key: string]: unknown
}

export type UpdateSavedFilterPayload = Partial<CreateSavedFilterPayload>

export interface CreatePlaylistPayload {
  name: string
  [key: string]: unknown
}

export type UpdatePlaylistPayload = Partial<CreatePlaylistPayload> & Record<string, unknown>

export interface DeleteMediaInPlaylistsPayload {
  mediaId?: number
  playlistId?: number
  [key: string]: unknown
}

export interface MediaInPlaylistOrderPayload {
  mediaId: number
  playlistId: number
  order: number
  [key: string]: unknown
}

export interface VideoMetadataUpdatePayload {
  mediaId?: number
  [key: string]: unknown
}

export interface MediaPathUpdatePayload {
  ids?: number[]
  id?: number
  path?: string
  [key: string]: unknown
}

export interface MediaIdsRequestPayload {
  metaId?: number
  mediaTypeId?: number | null
  filters?: FilterObject[]
  sortBy?: string
  [key: string]: unknown
}

export interface MarkItemsRequestPayload {
  filters?: FilterObject[]
  metaId?: number
  [key: string]: unknown
}

export interface MarkClipsRequestPayload {
  tagId: number
  sort?: 'time' | 'shuffle'
  countOnly?: boolean
}

export interface BulkMetaApplyPayload {
  itemType: 'media' | 'tag'
  itemIds: Array<number | string>
  changes?: Array<{
    editType?: number | string
    metaId?: number | string
    metaType?: string
    value?: unknown
  }>
  presetChanges?: Array<{
    editType?: number | string
    field?: string
    value?: unknown
  }>
}

export interface ConfigUpdatePayload {
  [key: string]: unknown
}

export type MediaTypeLike = MediaType

export interface TagItemsListRequest extends ItemsListRequest {
  metaId: number
}

export interface MediaThumbsRequestPayload {
  ids?: Array<number | string>
  mediaType?: string
}

export interface TagThumbsRequestPayload {
  metaId: number
  ids?: Array<number | string>
  types?: string[]
}

export interface SqlQueryPayload {
  query: string
  mediaTypeId?: number
  metaId?: number
  [key: string]: unknown
}
