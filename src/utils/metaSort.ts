import orderBy from 'lodash/orderBy'

export const META_SORT_MODES = {
  popularity: 'popularity',
  menu: 'menu',
  alphabet: 'alphabet',
} as const

export type MetaSortMode = typeof META_SORT_MODES[keyof typeof META_SORT_MODES]

export const META_GROUP_BY_MODES = {
  none: 'none',
  type: 'type',
} as const

export type MetaGroupByMode = typeof META_GROUP_BY_MODES[keyof typeof META_GROUP_BY_MODES]

export const META_TYPE_ORDER = ['array', 'number', 'date', 'string', 'rating', 'boolean']

interface MetaSortableItem {
  views?: number
  name?: string
  order?: number
  type?: string
}

interface TagSortableItem {
  views?: number
  name?: string
  id?: number
  favorite?: boolean | number
  createdAt?: string | number
  updatedAt?: string | number
  viewedAt?: string | number
  [key: string]: unknown
}

type TranslateFn = (key: string) => string

export function getMetaSortOptions(t: TranslateFn) {
  return [
    { title: t('settings_labels.meta.sort_popularity'), value: META_SORT_MODES.popularity },
    { title: t('settings_labels.meta.sort_menu'), value: META_SORT_MODES.menu },
    { title: t('settings_labels.meta.sort_alphabet'), value: META_SORT_MODES.alphabet },
  ]
}

export function sortMetaItems<T extends MetaSortableItem>(
  items: T[],
  mode: MetaSortMode = META_SORT_MODES.menu,
): T[] {
  switch (mode) {
    case META_SORT_MODES.popularity:
      return orderBy(items, [(item) => item.views || 0, (item) => item.name?.toLowerCase()], ['desc', 'asc'])
    case META_SORT_MODES.alphabet:
      return orderBy(items, [(item) => item.name?.toLowerCase()], ['asc'])
    case META_SORT_MODES.menu:
    default:
      return orderBy(items, [(item) => item.order ?? 0, (item) => item.name?.toLowerCase()], ['asc', 'asc'])
  }
}

/**
 * Sort tags using the category's saved sortBy/sortDir (meta.sortBy / meta.sortDir),
 * same approach as MetaInputArray tag pickers.
 */
export function sortTagsByCategoryPreference<T extends TagSortableItem>(
  tags: T[],
  sortBy = 'createdAt',
  sortDir: 'asc' | 'desc' | string = 'asc',
): T[] {
  const key = String(sortBy || 'createdAt')
  const dir = sortDir === 'desc' ? 'desc' : 'asc'
  const byName = orderBy(tags, [(tag) => String(tag.name || '').toLowerCase()], ['asc'])
  if (key === 'favorite') {
    return orderBy(
      byName,
      [(tag) => (tag.favorite ? 1 : 0), (tag) => String(tag.name || '').toLowerCase()],
      [dir, 'asc'],
    )
  }
  if (key === 'name') {
    return orderBy(byName, [(tag) => String(tag.name || '').toLowerCase()], [dir])
  }
  if (key === 'views') {
    return orderBy(
      byName,
      [(tag) => Number(tag.views) || 0, (tag) => String(tag.name || '').toLowerCase()],
      [dir, 'asc'],
    )
  }
  if (key === 'mediaCount' || key === 'numberOfMedia' || key === 'assignmentCount') {
    return orderBy(
      byName,
      [
        (tag) => Number(
          tag.mediaCount
          ?? tag.numberOfMedia
          ?? tag.assignmentCount,
        ) || 0,
        (tag) => String(tag.name || '').toLowerCase(),
      ],
      [dir, 'asc'],
    )
  }
  if (key === 'videoCount' || key === 'numberOfVideos') {
    return orderBy(
      byName,
      [
        (tag) => Number(tag.videoCount ?? tag.numberOfVideos) || 0,
        (tag) => String(tag.name || '').toLowerCase(),
      ],
      [dir, 'asc'],
    )
  }
  if (key === 'imageCount' || key === 'numberOfImages') {
    return orderBy(
      byName,
      [
        (tag) => Number(tag.imageCount ?? tag.numberOfImages) || 0,
        (tag) => String(tag.name || '').toLowerCase(),
      ],
      [dir, 'asc'],
    )
  }
  if (key === 'tagCount' || key === 'numberOfTags' || key === 'assignedTagCount') {
    return orderBy(
      byName,
      [
        (tag) => Number(
          tag.tagCount
          ?? tag.numberOfTags
          ?? tag.assignedTagCount,
        ) || 0,
        (tag) => String(tag.name || '').toLowerCase(),
      ],
      [dir, 'asc'],
    )
  }
  // createdAt / updatedAt / viewedAt / unknown → use field then name
  return orderBy(byName, [key, (tag) => String(tag.name || '').toLowerCase()], [dir, 'asc'])
}

export function sortTagItems<T extends TagSortableItem>(
  tags: T[],
  mode: MetaSortMode = META_SORT_MODES.menu,
  categorySort?: {sortBy?: string | null; sortDir?: string | null},
): T[] {
  switch (mode) {
    case META_SORT_MODES.popularity:
      return orderBy(tags, [(tag) => tag.views || 0, (tag) => tag.name?.toLowerCase()], ['desc', 'asc'])
    case META_SORT_MODES.alphabet:
      return orderBy(tags, [(tag) => tag.name?.toLowerCase()], ['asc'])
    case META_SORT_MODES.menu:
    default:
      return sortTagsByCategoryPreference(
        tags,
        categorySort?.sortBy || 'createdAt',
        categorySort?.sortDir || 'asc',
      )
  }
}

export function groupMetaByType<T extends MetaSortableItem>(
  items: T[],
  mode: MetaSortMode = META_SORT_MODES.menu,
): Record<string, T[]> {
  const sorted = sortMetaItems(items, mode)
  const grouped: Record<string, T[]> = {}

  for (const type of META_TYPE_ORDER) {
    const group = sorted.filter((item) => item.type === type)
    if (group.length) grouped[type] = group
  }

  return grouped
}

export function getTopTagsSubtitleKey(
  mode: MetaSortMode,
  categorySortBy?: string | null,
): string {
  switch (mode) {
    case META_SORT_MODES.popularity:
      return 'widgets.top_tags.top_by_views'
    case META_SORT_MODES.alphabet:
      return 'widgets.top_tags.top_alphabet'
    case META_SORT_MODES.menu:
    default: {
      switch (String(categorySortBy || 'createdAt')) {
        case 'name':
          return 'widgets.top_tags.top_alphabet'
        case 'views':
          return 'widgets.top_tags.top_by_views'
        case 'favorite':
          return 'widgets.top_tags.top_by_favorite'
        case 'updatedAt':
          return 'widgets.top_tags.top_by_updated'
        case 'mediaCount':
        case 'numberOfMedia':
        case 'assignmentCount':
          return 'widgets.top_tags.top_by_media_count'
        case 'videoCount':
        case 'numberOfVideos':
          return 'widgets.top_tags.top_by_video_count'
        case 'imageCount':
        case 'numberOfImages':
          return 'widgets.top_tags.top_by_image_count'
        case 'tagCount':
        case 'numberOfTags':
        case 'assignedTagCount':
          return 'widgets.top_tags.top_by_tag_count'
        case 'createdAt':
        default:
          return 'widgets.top_tags.top_by_created'
      }
    }
  }
}
