import type { PlayerMark } from '@/types/player'
import {
  BOOKMARK_ICON_PRESETS,
  CHAPTER_MARK_ICON,
  DEFAULT_BOOKMARK_ICON,
  MARK_FILTER_CHAPTER,
  isChapterMark,
  normalizeMarkIcon,
} from '@shared/markIcons'

export {
  BOOKMARK_ICON_PRESETS,
  CHAPTER_MARK_ICON,
  DEFAULT_BOOKMARK_ICON,
  MARK_FILTER_CHAPTER,
  isChapterMark,
  normalizeMarkIcon,
}

export const BASE_MARK_TYPES = [
  { value: 'favorite', textKey: 'meta.default_names.favorite', icon: 'heart', color: '#e91e63' },
  { value: 'bookmark', textKey: 'meta.default_names.bookmark', icon: DEFAULT_BOOKMARK_ICON, color: '#f44336' },
] as const

export const TAG_MARK_TYPE = {
  value: 'tag',
  textKey: 'player.mark_dialog.tag_type',
  icon: 'tag',
  color: '#2196f3',
} as const

export const isTagMarkType = (type: string): boolean => type === 'tag'

/** UI mode that needs a tag picker (single Tag chip, not per-category). */
export const isMetaMarkType = (type: string): boolean => isTagMarkType(type)

interface AssignedMetaItem {
  meta?: { id?: number; name?: string; icon?: string; marks?: boolean; type?: string }
  metaId?: number
}

/** Assigned array categories for filter chips (ignores legacy meta.marks). */
export function getAssignedArrayMetas(assigned: AssignedMetaItem[] = []) {
  return assigned.filter((item) => {
    const metaType = String(item.meta?.type || '').toLowerCase()
    return metaType === 'array' && item.meta?.id != null
  })
}

export function buildMarkTypes(_assigned: AssignedMetaItem[] = []) {
  void _assigned
  return [...BASE_MARK_TYPES, TAG_MARK_TYPE]
}

export function findAssignedMeta(assigned: AssignedMetaItem[] | null | undefined, type: unknown) {
  const metaId = Number(type)
  return (assigned || []).find(
    (item) => Number(item.metaId ?? item.meta?.id) === metaId,
  )
}

export function normalizeMarkTime(value: unknown, fallback = 0): number {
  const time = Math.floor(Number(value))
  if (!Number.isFinite(time)) return fallback
  return Math.max(0, time)
}

interface MarkAddingState {
  time: unknown
  is_end_time_active?: boolean
  end?: unknown
  type: string
  icon?: string | null
}

export function buildMarkPayload({
  adding,
  data = {},
  mediaId,
}: {
  adding: MarkAddingState
  data?: Record<string, unknown>
  mediaId: number | string
}): PlayerMark & Record<string, unknown> {
  const time = normalizeMarkTime(adding.time)
  const hasEnd = adding.is_end_time_active && adding.end != null
  const end = hasEnd ? Math.max(time, normalizeMarkTime(adding.end, time)) : null
  const tagId = data.tagId != null
    ? (Array.isArray(data.tagId) ? data.tagId[0] : data.tagId)
    : null
  const iconFromData = typeof data.icon === 'string' ? data.icon : adding.icon

  const mark: PlayerMark & Record<string, unknown> = {
    type: tagId ? 'meta' : adding.type,
    time,
    end,
    mediaId: Number(mediaId),
    tagId: null,
    text: null,
    icon: null,
    ...data,
  }

  if (tagId) {
    mark.type = 'meta'
    mark.tagId = tagId
    mark.text = null
    mark.icon = null
  } else {
    mark.tagId = null
    if (adding.type === 'bookmark' || adding.type === 'scene') {
      mark.type = 'bookmark'
      mark.text = typeof data.text === 'string' ? data.text : null
      const iconFallback = adding.type === 'scene' ? CHAPTER_MARK_ICON : DEFAULT_BOOKMARK_ICON
      mark.icon = normalizeMarkIcon(iconFromData, iconFallback)
    } else if (adding.type === 'favorite') {
      mark.type = 'favorite'
      mark.text = null
      mark.icon = null
    } else if (isTagMarkType(String(adding.type))) {
      // Incomplete tag mark — keep type tag so caller validation can catch it.
      mark.type = 'tag'
      mark.text = null
      mark.icon = null
    } else {
      mark.type = adding.type
      mark.text = null
      mark.icon = null
    }
  }

  mark.end = end
  mark.time = time
  mark.mediaId = Number(mediaId)

  return mark
}

export function resolveMarkEditType(mark: {
  type?: string | null
  tag?: { metaId?: number | null } | null
  metaId?: number | null
  meta?: { id?: number | null } | null
  'tag.metaId'?: number | null
}): string {
  const type = mark.type || 'favorite'
  if (type === 'scene') return 'bookmark'
  if (type === 'meta' || type === 'tag') return TAG_MARK_TYPE.value
  return type
}

export function resolveMarkEditIcon(mark: {
  type?: string | null
  icon?: string | null
}): string {
  if (String(mark.type || '').toLowerCase() === 'scene') {
    return CHAPTER_MARK_ICON
  }
  if (isChapterMark(mark)) return CHAPTER_MARK_ICON
  return normalizeMarkIcon(mark.icon, DEFAULT_BOOKMARK_ICON)
}
