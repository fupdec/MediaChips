import type { ItemTagRef, ItemValueRef } from './media'
import type { MediaType } from './media'

export interface Meta {
  id: number
  name?: string
  parser?: boolean
  icon?: string
  chipVariant?: string
  color?: boolean
  autoColorFromImage?: boolean
  rating?: boolean
  favorite?: boolean
  synonyms?: boolean
  imageAspectRatio?: number
  tagPageDesign?: string
  hidden?: boolean
  order?: number
  type?: string
  [key: string]: unknown
}

export interface AssignedMeta {
  id?: number | string
  order?: number
  metaId?: number
  mediaTypeId?: number
  mediaType?: MediaType
  pinnedMetaId?: number
  scraper?: string | null
  show?: number | boolean
  meta?: Meta
  [key: string]: unknown
}

export interface MetaSetting {
  synonyms?: boolean
  hidden?: boolean
  nested?: boolean
  marks?: boolean
  bookmark?: boolean
  parser?: boolean
  country?: boolean
  career?: boolean
  scraper?: boolean
  rating?: boolean
  favorite?: boolean
  chipOutlined?: boolean
  chipLabel?: boolean
  color?: boolean
  autoColorFromImage?: boolean
  imageAspectRatio?: number
  tagPageDesign?: string
  isLink?: boolean
  ratingIcon?: string
  ratingIconEmpty?: string
  ratingIconHalf?: string
  ratingMax?: number
  ratingColor?: string
  ratingHalf?: boolean
  sortBy?: string
  sortDir?: string
  metaId?: number
  [key: string]: unknown
}

export interface Tag {
  id: number
  metaId?: number
  name?: string
  synonyms?: string
  favorite?: boolean
  color?: string
  bookmark?: string
  values?: ItemValueRef[]
  tags?: ItemTagRef[]
  [key: string]: unknown
}

export interface MetaInMediaTypeAssignmentRow extends AssignedMeta {
  mediaTypeId: number
  mediaType?: MediaType
}

export interface MetaInMediaTypeRow extends AssignedMeta {
  metaId: number
}

export interface PinnedChildMetaAssignmentRow extends AssignedMeta {
  pinnedMetaId: number
}

/** Meta entries used for mark page filters (`marks: true`). */
export type MarkFilterMeta = Meta

export interface MetaWritePayload extends Partial<Meta>, Partial<MetaSetting> {
  hint?: string
  nameSingular?: string
  metaSetting?: Partial<MetaSetting>
  pageSetting?: Record<string, unknown>
  [key: string]: unknown
}
