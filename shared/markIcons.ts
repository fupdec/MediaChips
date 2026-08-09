/** mdi name without `mdi-` prefix — used for auto chapters and the Chapters filter. */
export const CHAPTER_MARK_ICON = 'movie-open-outline'

/** Default icon for plain bookmarks (non-chapter). */
export const DEFAULT_BOOKMARK_ICON = 'bookmark'

/** Filter chip value in player / Markers UI (not a DB type). */
export const MARK_FILTER_CHAPTER = 'chapter'

export const BOOKMARK_ICON_PRESETS = [
  DEFAULT_BOOKMARK_ICON,
  CHAPTER_MARK_ICON,
  'flag',
  'map-marker',
  'star',
  'lightbulb-outline',
] as const

export function normalizeMarkIcon(icon: unknown, fallback = DEFAULT_BOOKMARK_ICON): string {
  const value = String(icon || '').trim().replace(/^mdi-/i, '')
  return value || fallback
}

export function isChapterMarkIcon(icon: unknown): boolean {
  return normalizeMarkIcon(icon, '') === CHAPTER_MARK_ICON
}

/** Chapter = bookmark with chapter icon (or legacy type=scene), no tag. */
export function isChapterMark(mark: {
  type?: string | null
  icon?: string | null
  tagId?: number | null
}): boolean {
  if (mark.tagId != null) return false
  const type = String(mark.type || '').toLowerCase()
  if (type === 'scene') return true
  if (type !== 'bookmark') return false
  return isChapterMarkIcon(mark.icon)
}
