export const MEDIA_TYPE_VIDEO = 'video' as const
export const MEDIA_TYPE_IMAGE = 'image' as const
export const MEDIA_TYPE_AUDIO = 'audio' as const
export const MEDIA_TYPE_TEXT = 'text' as const

export type MediaTypeKey =
  | typeof MEDIA_TYPE_VIDEO
  | typeof MEDIA_TYPE_IMAGE
  | typeof MEDIA_TYPE_AUDIO
  | typeof MEDIA_TYPE_TEXT
  | string

export interface MediaType {
  id: number
  type?: string
  name?: string
  icon?: string
  extensions?: string
  hidden?: boolean
  custom?: boolean
  order?: number
}

export interface MediaTypeFilterParam {
  media_types?: string[]
  media_type_id?: number[]
}

export interface ItemTagRef {
  tagId: number
  metaId?: number
  /** Present when the tag is inherited from a tagged parent folder. */
  fromFolder?: boolean
}

export interface ItemValueRef {
  metaId: number
  value: unknown
}

export interface MediaItem {
  /** Positive IDs belong to the library; 0 is a temporary playback-only item. */
  id: number
  name?: string
  path?: string
  /** Persisted catalog observations; reading these never contacts the original. */
  hasCopies?: boolean | number
  sourceTokens?: string
  sourceNames?: string | null
  availability?: 'available' | 'unavailable' | 'unknown'
  basename?: string
  ext?: string
  mediaTypeId?: number
  width?: number | null
  height?: number | null
  filesize?: number | null
  thumb?: string
  views?: number
  favorite?: boolean
  duration?: number
  time?: number
  color?: string
  bookmark?: string
  synonyms?: string
  values?: ItemValueRef[]
  tags?: ItemTagRef[]
  /** Timed clip playlist fields (marks with start/end). */
  markId?: number
  segmentStart?: number
  segmentEnd?: number
  /** CLIP grid tile used for semantic scene seek (recomputed against real duration). */
  semanticTileIndex?: number | null
  key?: string
  [key: string]: unknown
}

/** Minimal media shape accepted by the player and playlist actions. */
export type PlayableMedia = Pick<MediaItem, 'id'> & Partial<Pick<MediaItem,
  | 'path'
  | 'name'
  | 'mediaTypeId'
  | 'duration'
  | 'thumb'
  | 'time'
  | 'markId'
  | 'segmentStart'
  | 'segmentEnd'
  | 'semanticTileIndex'
  | 'key'
  | 'basename'
>>
