import type { AnyRecord, MediaLike } from './db'

export interface MarkTagLike {
  metaId?: number | string
  name?: string
}

export interface MarkLike extends AnyRecord {
  id?: number | string
  type?: string
  time?: number | string
  text?: string
  media?: MediaLike
  medium?: MediaLike & { name?: string; basename?: string }
  tag?: MarkTagLike
  toJSON?: () => MarkLike
}

export type MarkSortKey = 'videoName' | 'type' | 'tagName' | 'id' | 'time' | 'shuffle'

export interface MarkLoadOptions {
  types?: Array<number | string>
  sortBy?: MarkSortKey | string
  sortDir?: 'asc' | 'desc' | string
  page?: number
  limit?: number
  search?: string
}

export type MarkSortValue = string | number
