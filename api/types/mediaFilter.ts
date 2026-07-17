import type { FilterLike, AnyRecord, MediaLike } from './db'

export type SqlParamBinder = (value: unknown) => string

export type FilterCondition = FilterLike['cond']

export interface MediaFilterOptions {
  mediaTypeId?: number | string
  ids?: Array<number | string>
  find_duplicates?: boolean
  sortBy?: string
  filters?: FilterLike[]
}

export interface MediaFilterQuerySuccess {
  ok: true
  whereSql: string
  joinSql: string
  needsDistinct: boolean
  replacements: AnyRecord
}

export interface MediaFilterQueryFailure {
  ok: false
  reason: string
  filter?: {
    index?: number
    param?: unknown
    type?: string | null
    cond?: string | null
  }
}

export type MediaFilterQueryResult = MediaFilterQuerySuccess | MediaFilterQueryFailure

export type NavigationMediaItem = MediaLike & {
  width?: number | string | null
  height?: number | string | null
  duration?: number | null
  bitrate?: number | null
  codec?: string | null
  fps?: number | null
  time?: number | null
  rating?: number | null
  favorite?: boolean | null
  views?: number | null
  viewedAt?: string | null
  orientation?: string | null
}

export interface MediaTagLink {
  tagId: number | string
  metaId: number | string
}

export interface MediaValueLink {
  value: string
  metaId: number | string
}

export type LoadedMediaItem = NavigationMediaItem & {
  tags: MediaTagLink[]
  values: MediaValueLink[]
  key: string
}

export interface MediaLoadOptions {
  mediaTypeId?: number | string
  ids?: MediaId[]
  filters?: FilterLike[]
  sortBy?: string
  direction?: 'asc' | 'desc' | string
  page?: number
  limit?: number | null
  pageLimit?: number
  find_duplicates?: boolean
  duplicates_by?: string
  includeNavigation?: boolean
  skipTotals?: boolean
  previewLimit?: number
  /** Serialized group-by setting, e.g. `firstLetter` or `pinnedMeta:42`. */
  groupBy?: string
  /** Meta type for pinnedMeta grouping (`array`, `string`, …). */
  groupByMetaType?: string | null
}

export type MediaId = number | string
