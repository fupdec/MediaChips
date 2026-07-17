import {parseMediaFilePath} from './mediaPath'

export type ItemsGroupBy =
  | 'none'
  | 'firstLetter'
  | 'dateMonth'
  | 'dateYear'
  | 'dateDay'
  | 'rating'
  | 'favorite'
  | 'path'
  | 'diskRoot'
  | 'ext'
  | 'filesize'
  | 'duration'
  | 'views'
  | 'codec'
  | 'fps'
  | 'bitrate'
  | 'resolution'
  | 'pinnedMeta'

export interface ItemsGroupSection<T> {
  key: string
  label: string
  items: T[]
  count?: number
  filter?: GroupFilterPayload | null
}

export type GroupFilterPayload = {
  metaId: number
  type: string
  tagIds?: number[]
  value?: unknown
} | null

export type GroupableItem = {
  id?: number
  name?: string | null
  path?: string | null
  ext?: string | null
  rating?: number | string | null
  favorite?: boolean | number | string | null
  filesize?: number | string | null
  duration?: number | string | null
  views?: number | string | null
  codec?: string | null
  fps?: number | string | null
  bitrate?: number | string | null
  width?: number | string | null
  height?: number | string | null
  createdAt?: string | number | Date | null
  updatedAt?: string | number | Date | null
  viewedAt?: string | number | Date | null
  tags?: Array<{tagId?: number; metaId?: number}>
  values?: Array<{metaId?: number; value?: unknown}>
  [key: string]: unknown
}

export type GroupLabelTranslator = (key: string, params?: Record<string, string | number>) => string

export interface BuildItemGroupsOptions {
  locale?: string
  t?: GroupLabelTranslator
  metaId?: number | null
  metaType?: string | null
  resolveTagName?: (tagId: number) => string
  /** List sort direction — reverses group order when `desc`. */
  direction?: 'asc' | 'desc' | string | null
}

export const DATE_GROUP_SORT_FIELDS = ['createdAt', 'updatedAt', 'viewedAt'] as const
export type DateGroupSortField = (typeof DATE_GROUP_SORT_FIELDS)[number]

export const MEDIA_ONLY_GROUP_BY = new Set<ItemsGroupBy>([
  'path',
  'diskRoot',
  'ext',
  'filesize',
  'duration',
  'codec',
  'fps',
  'bitrate',
  'resolution',
])

const REBUCKET_GROUP_BY = new Set<ItemsGroupBy>([
  'favorite',
  'ext',
  'codec',
  'path',
  'diskRoot',
  'pinnedMeta',
])

const FIRST_LETTER_RE = /^\p{L}/u
const PINNED_META_RE = /^pinnedMeta(?::(\d+))?$/

const GROUP_BY_VALUES = new Set<ItemsGroupBy>([
  'none',
  'firstLetter',
  'dateMonth',
  'dateYear',
  'dateDay',
  'rating',
  'favorite',
  'path',
  'diskRoot',
  'ext',
  'filesize',
  'duration',
  'views',
  'codec',
  'fps',
  'bitrate',
  'resolution',
  'pinnedMeta',
])

const MB = 1024 * 1024
const GB = 1024 * MB
const KBPS = 1000
const MBPS = 1000 * KBPS

export const FILESIZE_BUCKETS: Array<{
  key: string
  maxExclusive: number | null
  i18nKey: string
  fallback: string
}> = [
  {key: 'lt1mb', maxExclusive: MB, i18nKey: 'items.group_by_filesize_lt1mb', fallback: '< 1 MB'},
  {key: '1_10mb', maxExclusive: 10 * MB, i18nKey: 'items.group_by_filesize_1_10mb', fallback: '1–10 MB'},
  {key: '10_50mb', maxExclusive: 50 * MB, i18nKey: 'items.group_by_filesize_10_50mb', fallback: '10–50 MB'},
  {key: '50_100mb', maxExclusive: 100 * MB, i18nKey: 'items.group_by_filesize_50_100mb', fallback: '50–100 MB'},
  {key: '100_250mb', maxExclusive: 250 * MB, i18nKey: 'items.group_by_filesize_100_250mb', fallback: '100–250 MB'},
  {key: '250_500mb', maxExclusive: 500 * MB, i18nKey: 'items.group_by_filesize_250_500mb', fallback: '250–500 MB'},
  {key: '500mb_1gb', maxExclusive: GB, i18nKey: 'items.group_by_filesize_500mb_1gb', fallback: '500 MB–1 GB'},
  {key: '1_2gb', maxExclusive: 2 * GB, i18nKey: 'items.group_by_filesize_1_2gb', fallback: '1–2 GB'},
  {key: '2_5gb', maxExclusive: 5 * GB, i18nKey: 'items.group_by_filesize_2_5gb', fallback: '2–5 GB'},
  {key: '5_10gb', maxExclusive: 10 * GB, i18nKey: 'items.group_by_filesize_5_10gb', fallback: '5–10 GB'},
  {key: '10_50gb', maxExclusive: 50 * GB, i18nKey: 'items.group_by_filesize_10_50gb', fallback: '10–50 GB'},
  {key: 'gte50gb', maxExclusive: null, i18nKey: 'items.group_by_filesize_gte50gb', fallback: '≥ 50 GB'},
]

export const VIEWS_BUCKETS: Array<{
  key: string
  maxExclusive: number | null
  i18nKey: string
  fallback: string
}> = [
  {key: '0', maxExclusive: 1, i18nKey: 'items.group_by_views_0', fallback: '0'},
  {key: '1_10', maxExclusive: 11, i18nKey: 'items.group_by_views_1_10', fallback: '1–10'},
  {key: '11_50', maxExclusive: 51, i18nKey: 'items.group_by_views_11_50', fallback: '11–50'},
  {key: '51_100', maxExclusive: 101, i18nKey: 'items.group_by_views_51_100', fallback: '51–100'},
  {key: '101_500', maxExclusive: 501, i18nKey: 'items.group_by_views_101_500', fallback: '101–500'},
  {key: '501_1000', maxExclusive: 1001, i18nKey: 'items.group_by_views_501_1000', fallback: '501–1000'},
  {key: 'gte1001', maxExclusive: null, i18nKey: 'items.group_by_views_gte1001', fallback: '≥ 1001'},
]

export const BITRATE_BUCKETS: Array<{
  key: string
  maxExclusive: number | null
  i18nKey: string
  fallback: string
}> = [
  {key: 'lt1m', maxExclusive: MBPS, i18nKey: 'items.group_by_bitrate_lt1m', fallback: '< 1 Mbps'},
  {key: '1_5m', maxExclusive: 5 * MBPS, i18nKey: 'items.group_by_bitrate_1_5m', fallback: '1–5 Mbps'},
  {key: '5_10m', maxExclusive: 10 * MBPS, i18nKey: 'items.group_by_bitrate_5_10m', fallback: '5–10 Mbps'},
  {key: '10_20m', maxExclusive: 20 * MBPS, i18nKey: 'items.group_by_bitrate_10_20m', fallback: '10–20 Mbps'},
  {key: '20_50m', maxExclusive: 50 * MBPS, i18nKey: 'items.group_by_bitrate_20_50m', fallback: '20–50 Mbps'},
  {key: 'gte50m', maxExclusive: null, i18nKey: 'items.group_by_bitrate_gte50m', fallback: '≥ 50 Mbps'},
]

export function parseGroupBySetting(value: unknown): {
  groupBy: ItemsGroupBy
  metaId: number | null
} {
  if (value === 'letter' || value === '1' || value === 1 || value === true) {
    return {groupBy: 'firstLetter', metaId: null}
  }

  const raw = String(value ?? '').trim()
  const pinned = PINNED_META_RE.exec(raw)
  if (pinned) {
    return {
      groupBy: 'pinnedMeta',
      metaId: pinned[1] ? Number(pinned[1]) : null,
    }
  }

  if (GROUP_BY_VALUES.has(raw as ItemsGroupBy)) {
    return {groupBy: raw as ItemsGroupBy, metaId: null}
  }

  return {groupBy: 'none', metaId: null}
}

export function serializeGroupBySetting(groupBy: ItemsGroupBy, metaId?: number | null): string {
  if (groupBy === 'pinnedMeta') {
    return metaId != null && Number.isFinite(Number(metaId))
      ? `pinnedMeta:${Number(metaId)}`
      : 'pinnedMeta'
  }
  return groupBy
}

export function normalizeItemsGroupBy(value: unknown): ItemsGroupBy {
  return parseGroupBySetting(value).groupBy
}

export function isDateGroupSortField(sortBy: unknown): sortBy is DateGroupSortField {
  return DATE_GROUP_SORT_FIELDS.includes(String(sortBy) as DateGroupSortField)
}

export function getGroupByRequiredSort(groupBy: ItemsGroupBy): string | null {
  switch (groupBy) {
    case 'firstLetter':
      return 'name'
    case 'dateMonth':
    case 'dateYear':
    case 'dateDay':
      return 'createdAt'
    case 'rating':
      return 'rating'
    case 'filesize':
      return 'filesize'
    case 'duration':
      return 'duration'
    case 'views':
      return 'views'
    case 'fps':
      return 'fps'
    case 'bitrate':
      return 'bitrate'
    case 'resolution':
      return 'height'
    default:
      return null
  }
}

export function isSortCompatibleWithGroupBy(groupBy: ItemsGroupBy, sortBy: unknown): boolean {
  if (groupBy === 'none') return true
  // Server aggregation rebuckets all modes; only shuffle is incompatible for display.
  if (String(sortBy) === 'shuffle') return false
  return true
}

export function resolveActiveItemsGroupBy(
  groupBy: unknown,
  sortBy: unknown,
  itemsType: 'media' | 'tag' | string = 'media',
): ItemsGroupBy {
  const normalized = normalizeItemsGroupBy(groupBy)
  if (normalized === 'none') return 'none'
  if (MEDIA_ONLY_GROUP_BY.has(normalized) && itemsType !== 'media') return 'none'
  if (!isSortCompatibleWithGroupBy(normalized, sortBy)) return 'none'
  return normalized
}

export function getItemFirstLetterKey(name: string | null | undefined): string {
  const trimmed = String(name ?? '').trim()
  if (!trimmed) return '#'

  const first = Array.from(trimmed)[0]
  if (!first || !FIRST_LETTER_RE.test(first)) return '#'

  return first.toLocaleUpperCase()
}

export function resolveDateGroupField(sortBy: unknown): DateGroupSortField {
  return isDateGroupSortField(sortBy) ? sortBy : 'createdAt'
}

export function parseItemDate(
  item: GroupableItem,
  sortBy: unknown = 'createdAt',
): Date | null {
  const field = resolveDateGroupField(sortBy)
  const raw = item[field]
  if (raw == null || raw === '') return null

  const date = raw instanceof Date ? raw : new Date(raw as string | number)
  if (Number.isNaN(date.getTime())) return null
  return date
}

export function getItemDateMonthKey(item: GroupableItem, sortBy?: unknown): string {
  const date = parseItemDate(item, sortBy)
  if (!date) return '#'
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

export function getItemDateYearKey(item: GroupableItem, sortBy?: unknown): string {
  const date = parseItemDate(item, sortBy)
  if (!date) return '#'
  return String(date.getFullYear())
}

export function getItemDateDayKey(item: GroupableItem, sortBy?: unknown): string {
  const date = parseItemDate(item, sortBy)
  if (!date) return '#'
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatDateMonthLabel(key: string, locale?: string): string {
  if (key === '#') return '#'
  const match = /^(\d{4})-(\d{2})$/.exec(key)
  if (!match) return key
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1)
  return new Intl.DateTimeFormat(locale, {month: 'long', year: 'numeric'}).format(date)
}

export function formatDateDayLabel(key: string, locale?: string): string {
  if (key === '#') return '#'
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!match) return key
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

export function getItemParentPath(path: string | null | undefined): string {
  const normalized = String(path ?? '').trim()
  if (!normalized) return '#'
  const index = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
  if (index <= 0) return '#'
  return normalized.slice(0, index) || '#'
}

export function getItemDiskRoot(path: string | null | undefined): string {
  let normalized = String(path ?? '').trim()
  if (!normalized) return '#'

  // Electron / browser sometimes stores file URLs instead of plain paths.
  if (/^file:/i.test(normalized)) {
    try {
      const url = new URL(normalized)
      normalized = decodeURIComponent(url.pathname || '')
      // file:///D:/Videos/a.mp4 → /D:/Videos/a.mp4 on Unix URL parsers
      if (/^\/[a-zA-Z]:/.test(normalized)) {
        normalized = normalized.slice(1)
      }
    } catch {
      normalized = decodeURIComponent(normalized.replace(/^file:\/\//i, ''))
      if (/^\/[a-zA-Z]:/.test(normalized)) {
        normalized = normalized.slice(1)
      }
    }
    normalized = normalized.trim()
    if (!normalized) return '#'
  }

  const drive = /^([a-zA-Z]:)([\\/]|$)/.exec(normalized)
  if (drive) return `${drive[1].toUpperCase()}\\`

  const unc = /^\\\\([^\\/]+)[\\/]([^\\/]+)/.exec(normalized)
  if (unc) return `\\\\${unc[1]}\\${unc[2]}`

  if (normalized.startsWith('/')) {
    const parts = normalized.split('/').filter(Boolean)
    if (!parts.length) return '/'
    // External/mounted volumes: /Volumes/DiskName/...
    if (parts[0] === 'Volumes' && parts[1]) {
      return `/Volumes/${parts[1]}`
    }
    return `/${parts[0]}`
  }

  return '#'
}

export function getItemExtKey(item: GroupableItem): string {
  const raw = item.ext || parseMediaFilePath(item.path).ext
  const ext = String(raw || '').trim().replace(/^\./, '').toLowerCase()
  return ext || '#'
}

export function getItemRatingKey(item: GroupableItem): string {
  const value = Number(item.rating)
  if (!Number.isFinite(value) || value <= 0) return '0'
  return String(value)
}

export function getItemFavoriteKey(item: GroupableItem): string {
  const value = item.favorite
  if (value === true || value === 1 || value === '1') return '1'
  return '0'
}

export function getItemFilesizeBucketKey(item: GroupableItem): string {
  const size = Number(item.filesize)
  if (!Number.isFinite(size) || size < 0) return '#'
  for (const bucket of FILESIZE_BUCKETS) {
    if (bucket.maxExclusive == null || size < bucket.maxExclusive) return bucket.key
  }
  return 'gte50gb'
}

export function getItemDurationBucketKey(item: GroupableItem): string {
  const duration = Number(item.duration)
  if (!Number.isFinite(duration) || duration < 0) return '#'
  if (duration < 60) return 'lt1m'
  if (duration < 10 * 60) return '1_10m'
  if (duration < 30 * 60) return '10_30m'
  if (duration < 60 * 60) return '30_60m'
  if (duration < 2 * 60 * 60) return '1_2h'
  if (duration < 3 * 60 * 60) return '2_3h'
  if (duration < 5 * 60 * 60) return '3_5h'
  if (duration < 10 * 60 * 60) return '5_10h'
  return 'gte10h'
}

export function getItemViewsBucketKey(item: GroupableItem): string {
  const views = Number(item.views)
  if (!Number.isFinite(views) || views < 0) return '#'
  for (const bucket of VIEWS_BUCKETS) {
    if (bucket.maxExclusive == null || views < bucket.maxExclusive) return bucket.key
  }
  return 'gte1001'
}

export function getItemCodecKey(item: GroupableItem): string {
  const codec = String(item.codec ?? '').trim().toLowerCase()
  return codec || '#'
}

export function getItemFpsKey(item: GroupableItem): string {
  const fps = Number(item.fps)
  if (!Number.isFinite(fps) || fps <= 0) return '#'
  return String(Math.round(fps * 100) / 100)
}

export function getItemBitrateBucketKey(item: GroupableItem): string {
  const bitrate = Number(item.bitrate)
  if (!Number.isFinite(bitrate) || bitrate <= 0) return '#'
  for (const bucket of BITRATE_BUCKETS) {
    if (bucket.maxExclusive == null || bitrate < bucket.maxExclusive) return bucket.key
  }
  return 'gte50m'
}

export function getItemResolutionKey(item: GroupableItem): string {
  const width = Number(item.width)
  const height = Number(item.height)
  const candidates = [width, height].filter((value) => Number.isFinite(value) && value > 0)
  if (!candidates.length) return '#'

  // Use the shorter side so 1920x1080 and 1080x1920 both map to 1080p.
  const shortSide = Math.min(...candidates)
  if (shortSide < 720) return 'sd'
  if (shortSide < 1080) return '720p'
  if (shortSide < 1440) return '1080p'
  if (shortSide < 2160) return '1440p'
  return '2160p'
}

export function getItemPinnedMetaGroup(
  item: GroupableItem,
  metaId: number | null | undefined,
  metaType: string | null | undefined,
  options: BuildItemGroupsOptions = {},
): {key: string; label: string; filter: GroupFilterPayload} {
  const {t, resolveTagName} = options
  if (metaId == null || !Number.isFinite(Number(metaId))) {
    return {
      key: '#',
      label: translate(t, 'items.group_by_pinned_meta_none', 'No value'),
      filter: null,
    }
  }

  const id = Number(metaId)
  const type = String(metaType || '')
  const isTagMeta = !type || type === 'array' || type === 'select'

  if (isTagMeta) {
    const tags = (item.tags || [])
      .map((entry) => {
        const tagId = Number(entry.tagId)
        if (!Number.isFinite(tagId) || Number(entry.metaId) !== id) return null
        const name = resolveTagName?.(tagId) || `#${tagId}`
        return {tagId, name}
      })
      .filter((entry): entry is {tagId: number; name: string} => entry != null)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: 'base'}))

    if (!tags.length) {
      return {
        key: '#',
        label: translate(t, 'items.group_by_pinned_meta_none', 'No value'),
        filter: {metaId: id, type: type || 'array', tagIds: []},
      }
    }

    // One primary tag per item so the group header maps to a single filter.
    const primary = tags[0]
    return {
      key: String(primary.tagId),
      label: primary.name,
      filter: {metaId: id, type: type || 'array', tagIds: [primary.tagId]},
    }
  }

  const valueRow = (item.values || []).find((entry) => Number(entry.metaId) === id)
  if (valueRow == null || valueRow.value === '' || valueRow.value == null) {
    return {
      key: '#',
      label: translate(t, 'items.group_by_pinned_meta_none', 'No value'),
      filter: {metaId: id, type: type || 'string', value: null},
    }
  }

  const label = String(valueRow.value)
  return {
    key: label,
    label,
    filter: {metaId: id, type: type || 'string', value: valueRow.value},
  }
}

function translate(
  t: GroupLabelTranslator | undefined,
  key: string,
  fallback: string,
  params?: Record<string, string | number>,
): string {
  if (!t) return fallback
  const value = t(key, params)
  return value === key ? fallback : value
}

function bucketLabel(
  key: string,
  buckets: Array<{key: string; i18nKey: string; fallback: string}>,
  t?: GroupLabelTranslator,
  unknownKey = 'items.group_by_unknown',
  unknownFallback = 'Unknown',
): string {
  if (key === '#') return translate(t, unknownKey, unknownFallback)
  const bucket = buckets.find((entry) => entry.key === key)
  return translate(t, bucket?.i18nKey || unknownKey, bucket?.fallback || unknownFallback)
}

export function getGroupKeyAndLabel(
  item: GroupableItem,
  groupBy: ItemsGroupBy,
  sortBy: unknown,
  options: BuildItemGroupsOptions = {},
): {key: string; label: string; filter?: GroupFilterPayload | null} {
  const {locale, t} = options

  switch (groupBy) {
    case 'firstLetter': {
      const letter = getItemFirstLetterKey(item.name)
      return {key: letter, label: letter}
    }
    case 'dateMonth': {
      const key = getItemDateMonthKey(item, sortBy)
      return {key, label: formatDateMonthLabel(key, locale)}
    }
    case 'dateYear': {
      const key = getItemDateYearKey(item, sortBy)
      return {key, label: key}
    }
    case 'dateDay': {
      const key = getItemDateDayKey(item, sortBy)
      return {key, label: formatDateDayLabel(key, locale)}
    }
    case 'rating': {
      const key = getItemRatingKey(item)
      if (key === '0') {
        return {key, label: translate(t, 'items.group_by_rating_none', 'No rating')}
      }
      return {
        key,
        label: translate(t, 'items.group_by_rating_value', `★ ${key}`, {value: key}),
      }
    }
    case 'favorite': {
      const key = getItemFavoriteKey(item)
      return {
        key,
        label: key === '1'
          ? translate(t, 'items.group_by_favorite_yes', 'Favorites')
          : translate(t, 'items.group_by_favorite_no', 'Other'),
      }
    }
    case 'path': {
      const key = getItemParentPath(item.path)
      return {key, label: key}
    }
    case 'diskRoot': {
      const key = getItemDiskRoot(item.path)
      return {key, label: key}
    }
    case 'ext': {
      const key = getItemExtKey(item)
      return {
        key,
        label: key === '#'
          ? translate(t, 'items.group_by_ext_none', 'No extension')
          : `.${key}`,
      }
    }
    case 'filesize': {
      const key = getItemFilesizeBucketKey(item)
      return {
        key,
        label: bucketLabel(key, FILESIZE_BUCKETS, t, 'items.group_by_filesize_unknown', 'Unknown size'),
      }
    }
    case 'duration': {
      const key = getItemDurationBucketKey(item)
      const labels: Record<string, [string, string]> = {
        '#': ['items.group_by_duration_unknown', 'Unknown duration'],
        lt1m: ['items.group_by_duration_lt1m', '< 1 min'],
        '1_10m': ['items.group_by_duration_1_10m', '1–10 min'],
        '10_30m': ['items.group_by_duration_10_30m', '10–30 min'],
        '30_60m': ['items.group_by_duration_30_60m', '30–60 min'],
        '1_2h': ['items.group_by_duration_1_2h', '1–2 hours'],
        '2_3h': ['items.group_by_duration_2_3h', '2–3 hours'],
        '3_5h': ['items.group_by_duration_3_5h', '3–5 hours'],
        '5_10h': ['items.group_by_duration_5_10h', '5–10 hours'],
        gte10h: ['items.group_by_duration_gte10h', '≥ 10 hours'],
      }
      const [i18nKey, fallback] = labels[key] || labels['#']
      return {key, label: translate(t, i18nKey, fallback)}
    }
    case 'views': {
      const key = getItemViewsBucketKey(item)
      return {
        key,
        label: bucketLabel(key, VIEWS_BUCKETS, t, 'items.group_by_views_unknown', 'Unknown views'),
      }
    }
    case 'codec': {
      const key = getItemCodecKey(item)
      return {
        key,
        label: key === '#'
          ? translate(t, 'items.group_by_codec_none', 'Unknown codec')
          : key,
      }
    }
    case 'fps': {
      const key = getItemFpsKey(item)
      return {
        key,
        label: key === '#'
          ? translate(t, 'items.group_by_fps_none', 'Unknown FPS')
          : translate(t, 'items.group_by_fps_value', `${key} fps`, {value: key}),
      }
    }
    case 'bitrate': {
      const key = getItemBitrateBucketKey(item)
      return {
        key,
        label: bucketLabel(key, BITRATE_BUCKETS, t, 'items.group_by_bitrate_unknown', 'Unknown bitrate'),
      }
    }
    case 'resolution': {
      const key = getItemResolutionKey(item)
      const labels: Record<string, [string, string]> = {
        '#': ['items.group_by_resolution_none', 'Unknown resolution'],
        sd: ['items.group_by_resolution_sd', 'SD'],
        '720p': ['items.group_by_resolution_720p', '720p'],
        '1080p': ['items.group_by_resolution_1080p', '1080p'],
        '1440p': ['items.group_by_resolution_1440p', '1440p'],
        '2160p': ['items.group_by_resolution_2160p', '4K+'],
      }
      const [i18nKey, fallback] = labels[key] || labels['#']
      return {key, label: translate(t, i18nKey, fallback)}
    }
    case 'pinnedMeta':
      return getItemPinnedMetaGroup(item, options.metaId, options.metaType, options)
    default:
      return {key: 'none', label: ''}
  }
}

function isNumericMetaType(metaType: string | null | undefined): boolean {
  const type = String(metaType || '')
  return type === 'number' || type === 'rating'
}

function isTagMetaType(metaType: string | null | undefined): boolean {
  const type = String(metaType || '')
  return !type || type === 'array' || type === 'select'
}

function compareNumericKeys(a: string, b: string): number {
  const numA = Number(a)
  const numB = Number(b)
  if (Number.isFinite(numA) && Number.isFinite(numB)) return numA - numB
  return a.localeCompare(b, undefined, {sensitivity: 'base', numeric: true})
}

export function compareGroupKeys(
  groupBy: ItemsGroupBy,
  a: string,
  b: string,
  options: Pick<BuildItemGroupsOptions, 'direction' | 'metaType' | 'locale' | 'resolveTagName'> & {
    labelA?: string | null
    labelB?: string | null
  } = {},
): number {
  if (a === b) return 0
  // Keep empty/unknown groups at the end regardless of direction.
  if (a === '#') return 1
  if (b === '#') return -1

  let result = 0

  if (groupBy === 'favorite') {
    result = a === '1' ? -1 : 1
  } else if (groupBy === 'filesize') {
    const order = FILESIZE_BUCKETS.map((bucket) => bucket.key)
    result = order.indexOf(a) - order.indexOf(b)
  } else if (groupBy === 'duration') {
    const order = ['lt1m', '1_10m', '10_30m', '30_60m', '1_2h', '2_3h', '3_5h', '5_10h', 'gte10h']
    result = order.indexOf(a) - order.indexOf(b)
  } else if (groupBy === 'views') {
    const order = VIEWS_BUCKETS.map((bucket) => bucket.key)
    result = order.indexOf(a) - order.indexOf(b)
  } else if (groupBy === 'bitrate') {
    const order = BITRATE_BUCKETS.map((bucket) => bucket.key)
    result = order.indexOf(a) - order.indexOf(b)
  } else if (groupBy === 'resolution') {
    const order = ['sd', '720p', '1080p', '1440p', '2160p']
    result = order.indexOf(a) - order.indexOf(b)
  } else if (groupBy === 'rating' || groupBy === 'fps') {
    result = compareNumericKeys(a, b)
  } else if (groupBy === 'pinnedMeta' && isNumericMetaType(options.metaType)) {
    result = compareNumericKeys(a, b)
  } else if (groupBy === 'pinnedMeta' && isTagMetaType(options.metaType)) {
    // Keys are tag ids — sort by tag name (label / resolveTagName), not by id.
    const nameA = options.labelA
      || (Number.isFinite(Number(a)) ? options.resolveTagName?.(Number(a)) : null)
      || a
    const nameB = options.labelB
      || (Number.isFinite(Number(b)) ? options.resolveTagName?.(Number(b)) : null)
      || b
    result = String(nameA).localeCompare(String(nameB), options.locale, {
      sensitivity: 'base',
      numeric: true,
    })
  } else {
    result = a.localeCompare(b, undefined, {sensitivity: 'base', numeric: true})
  }

  if (String(options.direction || 'asc').toLowerCase() === 'desc') {
    result = -result
  }
  return result
}

function buildRebucketedGroups<T extends GroupableItem>(
  items: T[],
  groupBy: ItemsGroupBy,
  sortBy: unknown,
  options: BuildItemGroupsOptions,
): ItemsGroupSection<T>[] {
  const buckets = new Map<string, {label: string; items: T[]; filter?: GroupFilterPayload | null}>()

  for (const item of items) {
    const {key, label, filter} = getGroupKeyAndLabel(item, groupBy, sortBy, options)
    const bucket = buckets.get(key)
    if (bucket) bucket.items.push(item)
    else buckets.set(key, {label, items: [item], filter})
  }

  return [...buckets.entries()]
    .sort(([keyA, bucketA], [keyB, bucketB]) => compareGroupKeys(groupBy, keyA, keyB, {
      ...options,
      labelA: bucketA.label,
      labelB: bucketB.label,
    }))
    .map(([key, bucket]) => ({
      key,
      label: bucket.label,
      items: bucket.items,
      filter: bucket.filter ?? null,
    }))
}

export function buildItemGroups<T extends GroupableItem>(
  items: T[],
  groupBy: ItemsGroupBy,
  sortBy: unknown = 'createdAt',
  options: BuildItemGroupsOptions | string = {},
): ItemsGroupSection<T>[] {
  const resolvedOptions: BuildItemGroupsOptions = typeof options === 'string'
    ? {locale: options}
    : options

  const active = normalizeItemsGroupBy(groupBy)
  if (active === 'none') return []
  if (String(sortBy) === 'shuffle') return []

  // Always rebucket: server and client share the same key space and order.
  return buildRebucketedGroups(items, active, sortBy, resolvedOptions)
}

export function resolveListGroupBy(
  groupByRaw: unknown,
  itemsType: 'media' | 'tag' = 'media',
): {groupBy: ItemsGroupBy; metaId: number | null} {
  const parsed = parseGroupBySetting(groupByRaw)
  if (parsed.groupBy === 'none') return parsed
  if (MEDIA_ONLY_GROUP_BY.has(parsed.groupBy) && itemsType !== 'media') {
    return {groupBy: 'none', metaId: null}
  }
  return parsed
}

export function buildFirstLetterGroups<T extends GroupableItem>(
  items: T[],
): ItemsGroupSection<T>[] {
  return buildItemGroups(items, 'firstLetter', 'name')
}

export type ItemsGroupSummary = {
  key: string
  label: string
  count: number
  filter?: GroupFilterPayload | null
}

/**
 * Assign group keys, order by (groupKey, original order), and return library-wide
 * group summaries plus ordered item ids for pagination.
 * `items` should already be sorted by the active list sort.
 */
export function aggregateGroupedItems<T extends GroupableItem>(
  items: T[],
  groupBy: ItemsGroupBy,
  sortBy: unknown = 'createdAt',
  options: BuildItemGroupsOptions = {},
): {groups: ItemsGroupSummary[]; orderedIds: number[]} {
  const active = normalizeItemsGroupBy(groupBy)
  if (active === 'none' || !items.length) {
    return {
      groups: [],
      orderedIds: items
        .map((item) => Number(item.id))
        .filter((id) => Number.isFinite(id)),
    }
  }

  const annotated = items.map((item, index) => {
    const {key, label, filter} = getGroupKeyAndLabel(item, active, sortBy, options)
    return {item, index, key, label, filter: filter ?? null}
  })

  annotated.sort((a, b) => {
    const byGroup = compareGroupKeys(active, a.key, b.key, {
      ...options,
      labelA: a.label,
      labelB: b.label,
    })
    if (byGroup !== 0) return byGroup
    return a.index - b.index
  })

  const groups: ItemsGroupSummary[] = []
  const groupsByKey = new Map<string, ItemsGroupSummary>()

  for (const entry of annotated) {
    const existing = groupsByKey.get(entry.key)
    if (existing) {
      existing.count += 1
      continue
    }
    const summary: ItemsGroupSummary = {
      key: entry.key,
      label: entry.label,
      count: 1,
      filter: entry.filter,
    }
    groupsByKey.set(entry.key, summary)
    groups.push(summary)
  }

  const orderedIds = annotated
    .map((entry) => Number(entry.item.id))
    .filter((id) => Number.isFinite(id))

  return {groups, orderedIds}
}
