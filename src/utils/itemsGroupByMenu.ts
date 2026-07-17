import type {MediaType} from '@/types/media'
import {isAudioMediaType, isImageMediaType, isVideoMediaType} from '@/utils/mediaType'
import {
  isSortGroupDivider,
  isSortGroupHeader,
  SORT_GROUP_ORDER,
  type SortGroupDivider,
  type SortGroupHeader,
} from '@/utils/mediaSortFilter'
import {
  serializeGroupBySetting,
  type ItemsGroupBy,
} from '@/utils/itemsGroupBy'

export type GroupByMenuOption = {
  /** Serialized setting value used as v-select item-value. */
  value: string
  groupBy: ItemsGroupBy
  metaId?: number | null
  icon: string
  textKey?: string
  label?: string
  mediaOnly?: boolean
  mediaTypes?: Array<'video' | 'audio' | 'image'>
  category: string
}

export type GroupByGroupedItem = GroupByMenuOption | SortGroupHeader | SortGroupDivider

const PRESET_GROUP_BY = new Set<ItemsGroupBy>([
  'firstLetter',
  'dateDay',
  'dateMonth',
  'dateYear',
  'rating',
  'favorite',
  'views',
])

const FILE_GROUP_BY = new Set<ItemsGroupBy>([
  'path',
  'diskRoot',
  'ext',
  'filesize',
])

const VIDEO_GROUP_BY = new Set<ItemsGroupBy>([
  'duration',
  'codec',
  'fps',
  'bitrate',
  'resolution',
])

const AUDIO_GROUP_BY = new Set<ItemsGroupBy>([
  'duration',
  'codec',
  'bitrate',
])

const IMAGE_GROUP_BY = new Set<ItemsGroupBy>([
  'resolution',
])

export const BASE_GROUP_BY_OPTIONS: Array<Omit<GroupByMenuOption, 'value' | 'category'>> = [
  {groupBy: 'none', icon: 'format-list-bulleted', textKey: 'items.group_by_none'},
  {groupBy: 'firstLetter', icon: 'alphabetical-variant', textKey: 'items.group_by_first_letter'},
  {groupBy: 'dateDay', icon: 'calendar-today', textKey: 'items.group_by_date_day'},
  {groupBy: 'dateMonth', icon: 'calendar-month', textKey: 'items.group_by_date_month'},
  {groupBy: 'dateYear', icon: 'calendar', textKey: 'items.group_by_date_year'},
  {groupBy: 'rating', icon: 'star', textKey: 'items.group_by_rating'},
  {groupBy: 'favorite', icon: 'heart', textKey: 'items.group_by_favorite'},
  {groupBy: 'views', icon: 'eye', textKey: 'items.group_by_views'},
  {groupBy: 'path', icon: 'folder', textKey: 'items.group_by_path', mediaOnly: true},
  {groupBy: 'diskRoot', icon: 'harddisk', textKey: 'items.group_by_disk_root', mediaOnly: true},
  {groupBy: 'ext', icon: 'file-outline', textKey: 'items.group_by_ext', mediaOnly: true},
  {groupBy: 'filesize', icon: 'sd', textKey: 'items.group_by_filesize', mediaOnly: true},
  {
    groupBy: 'duration',
    icon: 'clock-outline',
    textKey: 'items.group_by_duration',
    mediaOnly: true,
    mediaTypes: ['video', 'audio'],
  },
  {
    groupBy: 'codec',
    icon: 'filmstrip',
    textKey: 'items.group_by_codec',
    mediaOnly: true,
    mediaTypes: ['video', 'audio'],
  },
  {
    groupBy: 'fps',
    icon: 'speedometer',
    textKey: 'items.group_by_fps',
    mediaOnly: true,
    mediaTypes: ['video'],
  },
  {
    groupBy: 'bitrate',
    icon: 'waveform',
    textKey: 'items.group_by_bitrate',
    mediaOnly: true,
    mediaTypes: ['video', 'audio'],
  },
  {
    groupBy: 'resolution',
    icon: 'monitor-screenshot',
    textKey: 'items.group_by_resolution',
    mediaOnly: true,
    mediaTypes: ['video', 'image'],
  },
]

export function getGroupByOptionCategory(
  option: Pick<GroupByMenuOption, 'groupBy' | 'metaId' | 'mediaTypes'>,
  itemsType: string,
  mediaType: MediaType | null | undefined,
): string {
  if (option.groupBy === 'none') return ''
  if (option.groupBy === 'pinnedMeta' || option.metaId != null) return 'Pinned meta'
  if (PRESET_GROUP_BY.has(option.groupBy)) return 'Preset meta'
  if (FILE_GROUP_BY.has(option.groupBy)) return 'File'

  if (option.mediaTypes?.includes('video') && isVideoMediaType(mediaType) && VIDEO_GROUP_BY.has(option.groupBy)) {
    return 'Video'
  }
  if (option.mediaTypes?.includes('audio') && isAudioMediaType(mediaType) && AUDIO_GROUP_BY.has(option.groupBy)) {
    return 'Audio'
  }
  if (option.mediaTypes?.includes('image') && isImageMediaType(mediaType) && IMAGE_GROUP_BY.has(option.groupBy)) {
    return 'Image'
  }

  if (VIDEO_GROUP_BY.has(option.groupBy) && isVideoMediaType(mediaType)) return 'Video'
  if (AUDIO_GROUP_BY.has(option.groupBy) && isAudioMediaType(mediaType)) return 'Audio'
  if (IMAGE_GROUP_BY.has(option.groupBy) && isImageMediaType(mediaType)) return 'Image'

  return itemsType === 'tag' ? 'Tag' : 'Other'
}

export function isGroupByMenuOption(item: unknown): item is GroupByMenuOption {
  return typeof item === 'object' && item !== null && 'groupBy' in item && 'value' in item
}

export {isSortGroupDivider as isGroupByGroupDivider, isSortGroupHeader as isGroupByGroupHeader}

export function filterGroupByOptions(
  options: Array<Omit<GroupByMenuOption, 'value' | 'category'> & Partial<Pick<GroupByMenuOption, 'value' | 'category'>>>,
  itemsType: string,
  mediaType: MediaType | null | undefined,
): GroupByMenuOption[] {
  return options
    .filter((option) => {
      if (option.mediaOnly && itemsType !== 'media') return false
      if (!option.mediaTypes?.length) return true
      if (option.mediaTypes.includes('video') && isVideoMediaType(mediaType)) return true
      if (option.mediaTypes.includes('audio') && isAudioMediaType(mediaType)) return true
      if (option.mediaTypes.includes('image') && isImageMediaType(mediaType)) return true
      return false
    })
    .map((option) => {
      const metaId = option.metaId ?? null
      const value = option.value
        || serializeGroupBySetting(option.groupBy, metaId)
      const category = option.category
        || getGroupByOptionCategory(option, itemsType, mediaType)
      return {
        ...option,
        value,
        metaId,
        category,
      }
    })
}

export function buildGroupedGroupByItems(
  options: GroupByMenuOption[],
): GroupByGroupedItem[] {
  const grouped = new Map<string, GroupByMenuOption[]>()

  for (const option of options) {
    const category = option.category || ''
    const list = grouped.get(category) || []
    list.push(option)
    grouped.set(category, list)
  }

  const result: GroupByGroupedItem[] = []
  const noneItems = grouped.get('') || []
  if (noneItems.length) {
    result.push(...noneItems)
    grouped.delete('')
  }

  const order = ['Preset meta', 'Pinned meta', 'File', 'Tag', 'Video', 'Image', 'Audio', 'Other', ...SORT_GROUP_ORDER]

  const seen = new Set<string>()
  for (const group of order) {
    if (seen.has(group)) continue
    seen.add(group)
    const items = grouped.get(group)
    if (!items?.length) continue
    if (result.length) result.push({divider: true})
    result.push({header: group})
    result.push(...items)
    grouped.delete(group)
  }

  for (const [group, items] of grouped) {
    if (!items.length) continue
    if (result.length) result.push({divider: true})
    if (group) result.push({header: group})
    result.push(...items)
  }

  return result
}
