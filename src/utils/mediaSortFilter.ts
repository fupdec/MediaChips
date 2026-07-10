import Cols from '../../app/configs/filter-cols'
import type { FilterObject } from '@/types/common'
import type { MediaType } from '@/types/media'
import type { AssignedMeta } from '@/types/stores'
import {
  getMediaTypeKey,
  isAudioMediaType,
  isImageMediaType,
  isVideoMediaType,
  matchesMediaTypeFilter,
} from '@/utils/mediaType'

export const SORTABLE_META_TYPES = new Set([
  'number',
  'rating',
  'date',
  'string',
  'boolean',
])

export const VIDEO_ONLY_FILTER_PARAMS = ['duration', 'bitrate', 'fps', 'codec']
export const AUDIO_ONLY_FILTER_PARAMS = ['duration', 'bitrate', 'codec']

export const MEDIA_SORT_PARAMS = [
  {param: 'path', icon: 'folder', textKey: 'filters.sort.path', types: ['media']},
  {
    param: 'name',
    icon: 'alphabetical-variant',
    textKey: 'filters.sort.name',
    types: ['media', 'tag'],
  },
  {param: 'rating', icon: 'star', textKey: 'filters.sort.rating', types: ['media', 'tag']},
  {
    param: 'createdAt',
    icon: 'calendar-plus',
    textKey: 'filters.sort.date_added',
    types: ['media', 'tag'],
  },
  {
    param: 'updatedAt',
    icon: 'calendar-edit',
    textKey: 'filters.sort.date_updated',
    types: ['media', 'tag'],
  },
  {
    param: 'viewedAt',
    icon: 'calendar-cursor',
    textKey: 'filters.sort.viewed_date',
    types: ['media', 'tag'],
  },
  {
    param: 'views',
    icon: 'eye',
    textKey: 'filters.sort.views',
    types: ['media', 'tag'],
  },
  {param: 'filesize', icon: 'harddisk', textKey: 'filters.sort.filesize', types: ['media']},
  {
    param: 'duration',
    icon: 'clock-outline',
    textKey: 'filters.sort.duration',
    types: ['media'],
    media_types: ['video', 'audio'],
  },
  {
    param: 'bitrate',
    icon: 'filmstrip',
    textKey: 'filters.sort.bitrate',
    types: ['media'],
    media_types: ['video', 'audio'],
  },
  {
    param: 'fps',
    icon: 'filmstrip',
    textKey: 'filters.sort.framerate',
    types: ['media'],
    media_types: ['video'],
  },
  {
    param: 'codec',
    icon: 'filmstrip',
    textKey: 'filters.sort.codec',
    types: ['media'],
    media_types: ['video', 'audio'],
  },
  {
    param: 'width',
    icon: 'monitor-screenshot',
    textKey: 'filters.sort.width',
    types: ['media'],
    media_types: ['video', 'image'],
  },
  {
    param: 'height',
    icon: 'monitor-screenshot',
    textKey: 'filters.sort.height',
    types: ['media'],
    media_types: ['video', 'image'],
  },
  {
    param: 'shuffle',
    icon: 'shuffle-variant',
    textKey: 'filters.sort.shuffle',
    types: ['media', 'tag'],
  },
]

export function getSortParams(itemsType: string, mediaType: MediaType | null | undefined) {
  return MEDIA_SORT_PARAMS.filter((param) =>
    param.types.includes(itemsType) &&
    matchesMediaTypeFilter(param, mediaType)
  )
}

export interface AssignedSortParam {
  param: number
  icon: string
  text: string
  types: Array<'media' | 'tag'>
}

export function getAssignedSortParams(assigned: AssignedMeta[] = []): AssignedSortParam[] {
  const params: AssignedSortParam[] = []

  for (const item of assigned) {
    const meta = item.meta
    const metaId = meta?.id
    const metaType = meta?.type

    if (metaId == null || !metaType || !SORTABLE_META_TYPES.has(metaType)) {
      continue
    }

    params.push({
      param: Number(metaId),
      icon: meta.icon || 'tag',
      text: meta.name || '',
      types: ['media', 'tag'],
    })
  }

  return params
}

export function getAllSortParams(
  itemsType: string,
  mediaType: MediaType | null | undefined,
  assigned: AssignedMeta[] = [],
) {
  return [
    ...getSortParams(itemsType, mediaType),
    ...getAssignedSortParams(assigned),
  ]
}

export type SortParamItem = ReturnType<typeof getAllSortParams>[number]

export function isAssignedSortParam(param: SortParamItem): param is AssignedSortParam {
  return typeof param.param === 'number'
}

export function getSortParamLabel(
  param: SortParamItem,
  translate: (key: string) => string,
): string {
  if (isAssignedSortParam(param)) {
    return param.text || ''
  }

  return translate(param.textKey)
}

export interface SortGroupHeader {
  header: string
}

export interface SortGroupDivider {
  divider: true
}

export type SortGroupedItem = SortParamItem | SortGroupHeader | SortGroupDivider

const PRESET_META_SORT_PARAMS = new Set(['rating', 'createdAt', 'updatedAt', 'viewedAt', 'views'])
const FILE_SORT_PARAMS = new Set(['path', 'filesize'])
const VIDEO_SORT_PARAMS = new Set(['duration', 'bitrate', 'fps', 'codec', 'width', 'height'])
const AUDIO_SORT_PARAMS = new Set(['duration', 'bitrate', 'codec'])
const IMAGE_SORT_PARAMS = new Set(['width', 'height'])

export const SORT_GROUP_ORDER = [
  'File',
  'Tag',
  'Video',
  'Image',
  'Audio',
  'Preset meta',
  'Pinned meta',
  'Other',
] as const

export function getSortParamGroup(
  param: SortParamItem,
  itemsType: string,
  mediaType: MediaType | null | undefined,
) {
  if (typeof param.param === 'number') {
    return 'Pinned meta'
  }

  const key = String(param.param)
  if (key === 'shuffle') return 'Other'
  if (PRESET_META_SORT_PARAMS.has(key)) return 'Preset meta'
  if (FILE_SORT_PARAMS.has(key)) return 'File'
  if (key === 'name') return itemsType === 'tag' ? 'Tag' : 'File'

  if (IMAGE_SORT_PARAMS.has(key) && isImageMediaType(mediaType)) {
    return 'Image'
  }
  if (AUDIO_SORT_PARAMS.has(key) && isAudioMediaType(mediaType)) {
    return 'Audio'
  }
  if (VIDEO_SORT_PARAMS.has(key)) {
    return 'Video'
  }

  return 'Other'
}

export function isSortGroupHeader(item: unknown): item is SortGroupHeader {
  return typeof item === 'object' && item !== null && 'header' in item
}

export function isSortGroupDivider(item: unknown): item is SortGroupDivider {
  return typeof item === 'object' && item !== null && 'divider' in item
}

export function isSortParamItem(item: unknown): item is SortParamItem {
  return typeof item === 'object' && item !== null && 'param' in item
}

export function buildGroupedSortItems(
  params: SortParamItem[],
  itemsType: string,
  mediaType: MediaType | null | undefined,
): SortGroupedItem[] {
  const grouped = new Map<string, SortParamItem[]>()

  for (const param of params) {
    const group = getSortParamGroup(param, itemsType, mediaType)
    const items = grouped.get(group) || []
    items.push(param)
    grouped.set(group, items)
  }

  const result: SortGroupedItem[] = []

  for (const group of SORT_GROUP_ORDER) {
    const items = grouped.get(group)
    if (!items?.length) continue

    result.push({header: group})
    result.push(...items)
    result.push({divider: true})
    grouped.delete(group)
  }

  for (const [group, items] of grouped) {
    if (!items.length) continue
    result.push({header: group})
    result.push(...items)
    result.push({divider: true})
  }

  if (result.length) {
    result.pop()
  }

  return result
}

export function normalizeSortBy(
  sortBy: unknown,
  itemsType: string,
  mediaType: MediaType | null | undefined,
  fallback = 'createdAt',
  assigned: AssignedMeta[] = [],
) {
  if (sortBy === 'shuffle') return sortBy

  const normalized = sortBy == null ? '' : String(sortBy)
  const allowed = getAllSortParams(itemsType, mediaType, assigned).map((param) => String(param.param))
  return allowed.includes(normalized) ? normalized : fallback
}

export function getAllowedFilterParams(itemsType: string, mediaType: MediaType | null | undefined) {
  const params = new Set()

  for (const item of Cols.standart || []) {
    params.add(item.param)
  }

  if (itemsType === 'media') {
    for (const item of Cols.media || []) {
      params.add(item.param)
    }
    if (isVideoMediaType(mediaType)) {
      for (const item of Cols.video || []) {
        params.add(item.param)
      }
    }
    if (isImageMediaType(mediaType)) {
      for (const item of Cols.image || []) {
        params.add(item.param)
      }
    }
    if (isAudioMediaType(mediaType)) {
      for (const item of Cols.audio || []) {
        params.add(item.param)
      }
    }
  } else if (itemsType === 'tag') {
    for (const item of Cols.metaTag || []) {
      params.add(item.param)
    }
  }

  return params
}

export function isFilterParamAllowed(
  param: unknown,
  itemsType: string,
  mediaType: MediaType | null | undefined,
) {
  if (typeof param === 'number') return true
  return getAllowedFilterParams(itemsType, mediaType).has(param)
}

export function sanitizeFiltersForMediaType(
  filters: FilterObject[],
  itemsType: string,
  mediaType: MediaType | null | undefined,
) {
  return filters.map((filter: FilterObject) => {
    if (filter.lock) return filter
    if (!isFilterParamAllowed(filter.param, itemsType, mediaType)) {
      return {...filter, active: false}
    }
    return filter
  })
}

export function getDuplicatesGroupKey(mediaType: MediaType | null | undefined) {
  return isImageMediaType(mediaType) ? 'path' : 'filesize'
}

export function getDuplicatesModeLabelKey(mediaType: MediaType | null | undefined) {
  return isImageMediaType(mediaType)
    ? 'filters.show_only_duplicates_by_path'
    : 'filters.show_only_duplicates_by_filesize'
}

export function getMediaTypeKeyFromId(mediaTypes: MediaType[] | null | undefined, mediaTypeId: unknown) {
  const mediaType = mediaTypes?.find((item) => item.id === Number(mediaTypeId))
  return getMediaTypeKey(mediaType)
}
