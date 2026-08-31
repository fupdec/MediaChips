import type { PlayerMark } from '@/types/player'
import {
  BOOKMARK_ICON_PRESETS,
  CHAPTER_MARK_ICON,
  DEFAULT_BOOKMARK_ICON,
  FAVORITE_MARK_ICON,
  MARK_FILTER_CHAPTER,
  isChapterMark,
  isFavoriteMarkIcon,
  normalizeMarkIcon,
} from '@shared/markIcons'

export {
  BOOKMARK_ICON_PRESETS,
  CHAPTER_MARK_ICON,
  DEFAULT_BOOKMARK_ICON,
  FAVORITE_MARK_ICON,
  MARK_FILTER_CHAPTER,
  isChapterMark,
  isFavoriteMarkIcon,
  normalizeMarkIcon,
}

export const FAVORITE_MARK_TYPE = {
  value: 'favorite',
  textKey: 'meta.default_names.favorite',
  icon: FAVORITE_MARK_ICON,
  color: '#e91e63',
} as const

export const BOOKMARK_MARK_TYPE = {
  value: 'bookmark',
  textKey: 'meta.default_names.bookmark',
  icon: DEFAULT_BOOKMARK_ICON,
  color: '#f44336',
} as const

export const BASE_MARK_TYPES = [
  FAVORITE_MARK_TYPE,
  BOOKMARK_MARK_TYPE,
] as const

export const TAG_MARK_TYPE = {
  value: 'tag',
  textKey: 'player.mark_dialog.tag_type',
  icon: 'tag',
  color: '#2196f3',
} as const

export const isTagMarkType = (type: string): boolean => type === 'tag'

export const isFavoriteMarkType = (type: string): boolean => type === 'favorite'

export const isNoteMarkType = (type: string): boolean => (
  type === 'bookmark' || type === 'favorite' || type === 'scene'
)

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
  return [BOOKMARK_MARK_TYPE, TAG_MARK_TYPE]
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
    if (adding.type === 'bookmark' || adding.type === 'scene' || adding.type === 'favorite') {
      const noteText = typeof data.text === 'string' ? data.text.trim() : ''
      mark.text = noteText || null
      if (adding.type === 'scene') {
        mark.type = 'bookmark'
        mark.icon = CHAPTER_MARK_ICON
      } else {
        const iconFallback = adding.type === 'favorite' ? FAVORITE_MARK_ICON : DEFAULT_BOOKMARK_ICON
        const icon = normalizeMarkIcon(iconFromData, iconFallback)
        if (adding.type === 'favorite' || isFavoriteMarkIcon(icon)) {
          mark.type = 'favorite'
          mark.icon = FAVORITE_MARK_ICON
        } else {
          mark.type = 'bookmark'
          mark.icon = icon
        }
      }
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

export function applyNoteIcon(iconName: string) {
  const icon = normalizeMarkIcon(iconName, DEFAULT_BOOKMARK_ICON)
  if (isFavoriteMarkIcon(icon)) {
    return {type: 'favorite' as const, icon: FAVORITE_MARK_ICON, color: FAVORITE_MARK_TYPE.color}
  }
  if (icon === CHAPTER_MARK_ICON) {
    return {type: 'bookmark' as const, icon: CHAPTER_MARK_ICON, color: '#26a69a'}
  }
  return {type: 'bookmark' as const, icon, color: BOOKMARK_MARK_TYPE.color}
}

export function resolveMarkEditIcon(mark: {
  type?: string | null
  icon?: string | null
}): string {
  const type = String(mark.type || '').toLowerCase()
  if (type === 'favorite' || isFavoriteMarkIcon(mark.icon)) return FAVORITE_MARK_ICON
  if (type === 'scene') return CHAPTER_MARK_ICON
  if (isChapterMark(mark)) return CHAPTER_MARK_ICON
  return normalizeMarkIcon(mark.icon, DEFAULT_BOOKMARK_ICON)
}
