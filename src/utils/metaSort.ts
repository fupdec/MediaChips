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

export function sortTagItems<T extends TagSortableItem>(
  tags: T[],
  mode: MetaSortMode = META_SORT_MODES.menu,
): T[] {
  switch (mode) {
    case META_SORT_MODES.popularity:
      return orderBy(tags, [(tag) => tag.views || 0, (tag) => tag.name?.toLowerCase()], ['desc', 'asc'])
    case META_SORT_MODES.alphabet:
      return orderBy(tags, [(tag) => tag.name?.toLowerCase()], ['asc'])
    case META_SORT_MODES.menu:
    default:
      return orderBy(tags, ['id'], ['asc'])
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

export function getTopTagsSubtitleKey(mode: MetaSortMode): string {
  switch (mode) {
    case META_SORT_MODES.popularity:
      return 'widgets.top_tags.top_by_views'
    case META_SORT_MODES.alphabet:
      return 'widgets.top_tags.top_alphabet'
    case META_SORT_MODES.menu:
    default:
      return 'widgets.top_tags.top_by_menu'
  }
}
