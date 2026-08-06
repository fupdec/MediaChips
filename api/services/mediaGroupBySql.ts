import type {ItemsGroupBy, ItemsGroupSummary} from '../../shared/itemsGroupBy'
import {
  BITRATE_BUCKETS,
  FILESIZE_BUCKETS,
  VIEWS_BUCKETS,
  compareGroupKeys,
  getGroupKeyAndLabel,
  getItemPinnedMetaGroup,
  resolveDateGroupField,
} from '../../shared/itemsGroupBy'
import {buildEffectiveMediaTagPairsSql} from './mediaTagFilterSql'

/** Modes keyed entirely from media/metadata columns (no path/unicode/tag joins). */
const SQL_MEDIA_GROUP_BY = new Set<ItemsGroupBy>([
  'rating',
  'favorite',
  'ext',
  'filesize',
  'duration',
  'views',
  'codec',
  'fps',
  'bitrate',
  'resolution',
  'dateDay',
  'dateMonth',
  'dateYear',
  'path',
  'diskRoot',
  'firstLetter',
])

export type MediaGroupBySqlOptions = {
  metaId?: number | null
  metaType?: string | null
  mediaTypeId?: number | string | null
}

export type MediaGroupBySqlPlan = {
  groupKeyExpr: string
  /** Appended after the list FROM clause (e.g. LEFT JOIN pinnedGroup …). */
  joinSql?: string
  replacements?: Record<string, unknown>
  /** Optional label expression for summary rows (pinnedMeta tag names). */
  labelExpr?: string
  metaId?: number | null
  metaType?: string | null
}

function isTagMetaType(metaType: string | null | undefined): boolean {
  const type = String(metaType || '')
  return !type || type === 'array' || type === 'select'
}

function isNumericMetaType(metaType: string | null | undefined): boolean {
  const type = String(metaType || '')
  return type === 'number' || type === 'rating'
}

function buildDateGroupKeySqlExpr(
  groupBy: 'dateDay' | 'dateMonth' | 'dateYear',
  sortBy: unknown,
): string {
  const field = resolveDateGroupField(sortBy)
  const column = `media.${field}`
  const format = groupBy === 'dateYear'
    ? '%Y'
    : groupBy === 'dateMonth'
      ? '%Y-%m'
      : '%Y-%m-%d'
  // Match shared/itemsGroupBy local-timezone Date getters.
  return `CASE
    WHEN ${column} IS NULL OR TRIM(${column}) = '' THEN '#'
    WHEN julianday(${column}) IS NULL THEN '#'
    ELSE strftime('${format}', ${column}, 'localtime')
  END`
}

type BucketSpec = {key: string; maxExclusive: number | null}

function buildThresholdBucketCase(
  columnSql: string,
  buckets: BucketSpec[],
  options: {
    unknownWhen: string
    unknownKey?: string
  },
): string {
  const unknownKey = options.unknownKey ?? '#'
  const branches = [
    `WHEN ${options.unknownWhen} THEN '${unknownKey}'`,
  ]
  for (const bucket of buckets) {
    if (bucket.maxExclusive == null) {
      branches.push(`ELSE '${bucket.key}'`)
    } else {
      branches.push(`WHEN ${columnSql} < ${bucket.maxExclusive} THEN '${bucket.key}'`)
    }
  }
  return `CASE ${branches.join(' ')} END`
}

function buildFixedOrderCase(groupKeyExpr: string, order: string[]): string {
  const branches = order.map((key, index) => `WHEN ${groupKeyExpr} = '${key}' THEN ${index}`)
  return `CASE ${branches.join(' ')} ELSE ${order.length} END`
}

function buildPinnedMetaTagPlan(
  metaId: number,
  metaType: string | null | undefined,
  mediaTypeId: number | string | null | undefined,
): MediaGroupBySqlPlan | null {
  if (mediaTypeId == null || mediaTypeId === '') return null

  const pairs = buildEffectiveMediaTagPairsSql(':groupMetaId')
  const joinSql = `LEFT JOIN (
    SELECT mediaId,
      CAST(tagId AS TEXT) AS groupKey,
      name AS groupLabel
    FROM (
      SELECT pairs.mediaId AS mediaId,
        pairs.tagId AS tagId,
        t.name AS name,
        ROW_NUMBER() OVER (
          PARTITION BY pairs.mediaId
          ORDER BY t.name COLLATE NOCASE ASC, pairs.tagId ASC
        ) AS rn
      FROM ${pairs} pairs
      INNER JOIN tags t ON t.id = pairs.tagId
    ) ranked
    WHERE rn = 1
  ) AS pinnedGroup ON pinnedGroup.mediaId = media.id`

  return {
    groupKeyExpr: `COALESCE(pinnedGroup.groupKey, '#')`,
    labelExpr: `CASE
      WHEN pinnedGroup.groupKey IS NULL THEN '#'
      ELSE COALESCE(pinnedGroup.groupLabel, '#' || pinnedGroup.groupKey)
    END`,
    joinSql,
    replacements: {
      groupMetaId: metaId,
      mediaTypeId,
    },
    metaId,
    metaType: metaType || 'array',
  }
}

function buildPinnedMetaValuePlan(
  metaId: number,
  metaType: string | null | undefined,
): MediaGroupBySqlPlan {
  const joinSql = `LEFT JOIN (
    SELECT mediaId, CAST(value AS TEXT) AS groupKey
    FROM (
      SELECT mediaId,
        value,
        ROW_NUMBER() OVER (PARTITION BY mediaId ORDER BY rowid ASC) AS rn
      FROM valuesInMedia
      WHERE metaId = :groupMetaId
        AND value IS NOT NULL
        AND TRIM(CAST(value AS TEXT)) != ''
    ) ranked
    WHERE rn = 1
  ) AS pinnedGroup ON pinnedGroup.mediaId = media.id`

  return {
    groupKeyExpr: `COALESCE(pinnedGroup.groupKey, '#')`,
    labelExpr: `COALESCE(pinnedGroup.groupKey, '#')`,
    joinSql,
    replacements: {groupMetaId: metaId},
    metaId,
    metaType: metaType || 'string',
  }
}

export function supportsSqlMediaGroupBy(
  groupBy: ItemsGroupBy,
  options: MediaGroupBySqlOptions = {},
): boolean {
  if (SQL_MEDIA_GROUP_BY.has(groupBy)) return true
  if (groupBy === 'pinnedMeta') {
    const metaId = Number(options.metaId)
    if (!Number.isFinite(metaId)) return false
    if (isTagMetaType(options.metaType)) {
      return options.mediaTypeId != null && options.mediaTypeId !== ''
    }
    return true
  }
  return false
}

/**
 * Full SQL grouping plan (expression + optional joins/replacements).
 * Returns null when the mode must stay on the JS slim-row path.
 */
export function buildMediaGroupBySqlPlan(
  groupBy: ItemsGroupBy,
  sortBy: unknown = 'id',
  options: MediaGroupBySqlOptions = {},
): MediaGroupBySqlPlan | null {
  if (groupBy === 'pinnedMeta') {
    const metaId = Number(options.metaId)
    if (!Number.isFinite(metaId)) return null
    if (isTagMetaType(options.metaType)) {
      return buildPinnedMetaTagPlan(metaId, options.metaType, options.mediaTypeId)
    }
    return buildPinnedMetaValuePlan(metaId, options.metaType)
  }

  const groupKeyExpr = buildMediaGroupKeySqlExpr(groupBy, sortBy)
  if (!groupKeyExpr) return null
  return {groupKeyExpr}
}

/**
 * SQL expression producing the same group keys as shared/itemsGroupBy helpers.
 * Returns null when the mode must stay on the JS slim-row path.
 */
export function buildMediaGroupKeySqlExpr(
  groupBy: ItemsGroupBy,
  sortBy: unknown = 'id',
): string | null {
  switch (groupBy) {
    case 'dateDay':
    case 'dateMonth':
    case 'dateYear':
      return buildDateGroupKeySqlExpr(groupBy, sortBy)
    case 'path':
      return `mc_group_parent_path(media.path)`
    case 'diskRoot':
      return `mc_group_disk_root(media.path)`
    case 'firstLetter':
      return `mc_group_first_letter(media.name)`
    case 'rating':
      return `CASE WHEN media.rating IS NULL OR media.rating <= 0 THEN '0' ELSE CAST(media.rating AS TEXT) END`
    case 'favorite':
      return `CASE WHEN media.favorite = 1 THEN '1' ELSE '0' END`
    case 'ext':
      return `CASE
        WHEN media.ext IS NULL OR TRIM(media.ext) = '' THEN '#'
        ELSE LOWER(LTRIM(TRIM(media.ext), '.'))
      END`
    case 'filesize':
      return buildThresholdBucketCase('media.filesize', FILESIZE_BUCKETS, {
        unknownWhen: 'media.filesize IS NULL OR media.filesize < 0',
      })
    case 'duration':
      return `CASE
        WHEN videoMetadata.duration IS NULL OR videoMetadata.duration < 0 THEN '#'
        WHEN videoMetadata.duration < 60 THEN 'lt1m'
        WHEN videoMetadata.duration < 600 THEN '1_10m'
        WHEN videoMetadata.duration < 1800 THEN '10_30m'
        WHEN videoMetadata.duration < 3600 THEN '30_60m'
        WHEN videoMetadata.duration < 7200 THEN '1_2h'
        WHEN videoMetadata.duration < 10800 THEN '2_3h'
        WHEN videoMetadata.duration < 18000 THEN '3_5h'
        WHEN videoMetadata.duration < 36000 THEN '5_10h'
        ELSE 'gte10h'
      END`
    case 'views':
      return buildThresholdBucketCase('media.views', VIEWS_BUCKETS, {
        unknownWhen: 'media.views IS NULL OR media.views < 0',
      })
    case 'codec':
      return `CASE
        WHEN videoMetadata.codec IS NULL OR TRIM(videoMetadata.codec) = '' THEN '#'
        ELSE LOWER(TRIM(videoMetadata.codec))
      END`
    case 'fps':
      // Match JS String(Math.round(fps*100)/100) — trim trailing zeros from printf.
      return `CASE
        WHEN videoMetadata.fps IS NULL OR CAST(videoMetadata.fps AS REAL) <= 0 THEN '#'
        ELSE RTRIM(RTRIM(printf('%.2f', ROUND(CAST(videoMetadata.fps AS REAL) * 100) / 100.0), '0'), '.')
      END`
    case 'bitrate':
      return buildThresholdBucketCase('videoMetadata.bitrate', BITRATE_BUCKETS, {
        unknownWhen: 'videoMetadata.bitrate IS NULL OR videoMetadata.bitrate <= 0',
      })
    case 'resolution': {
      const shortSide = `CASE
        WHEN COALESCE(videoMetadata.width, imageMetadata.width) IS NULL
          OR COALESCE(videoMetadata.height, imageMetadata.height) IS NULL
          OR COALESCE(videoMetadata.width, imageMetadata.width) <= 0
          OR COALESCE(videoMetadata.height, imageMetadata.height) <= 0
        THEN NULL
        ELSE MIN(
          COALESCE(videoMetadata.width, imageMetadata.width),
          COALESCE(videoMetadata.height, imageMetadata.height)
        )
      END`
      return `CASE
        WHEN (${shortSide}) IS NULL THEN '#'
        WHEN (${shortSide}) < 720 THEN 'sd'
        WHEN (${shortSide}) < 1080 THEN '720p'
        WHEN (${shortSide}) < 1440 THEN '1080p'
        WHEN (${shortSide}) < 2160 THEN '1440p'
        ELSE '2160p'
      END`
    }
    default:
      return null
  }
}

/** ORDER BY fragment for group key (then caller appends list sort). */
export function buildMediaGroupOrderSqlExpr(
  groupKeyExpr: string,
  groupBy: ItemsGroupBy,
  direction: string | null | undefined,
  options: Pick<MediaGroupBySqlPlan, 'labelExpr' | 'metaType'> = {},
): string {
  const desc = String(direction || 'asc').toLowerCase() === 'desc'
  const dirSql = desc ? 'DESC' : 'ASC'

  if (groupBy === 'favorite') {
    // Asc: favorites ('1') first — invert the key so 1 sorts before 0.
    return desc
      ? `${groupKeyExpr} ASC`
      : `${groupKeyExpr} DESC`
  }

  if (groupBy === 'filesize') {
    const orderExpr = buildFixedOrderCase(groupKeyExpr, FILESIZE_BUCKETS.map((b) => b.key))
    return `CASE WHEN ${groupKeyExpr} = '#' THEN 1 ELSE 0 END ASC, ${orderExpr} ${dirSql}`
  }
  if (groupBy === 'duration') {
    const order = ['lt1m', '1_10m', '10_30m', '30_60m', '1_2h', '2_3h', '3_5h', '5_10h', 'gte10h']
    const orderExpr = buildFixedOrderCase(groupKeyExpr, order)
    return `CASE WHEN ${groupKeyExpr} = '#' THEN 1 ELSE 0 END ASC, ${orderExpr} ${dirSql}`
  }
  if (groupBy === 'views') {
    const orderExpr = buildFixedOrderCase(groupKeyExpr, VIEWS_BUCKETS.map((b) => b.key))
    return `CASE WHEN ${groupKeyExpr} = '#' THEN 1 ELSE 0 END ASC, ${orderExpr} ${dirSql}`
  }
  if (groupBy === 'bitrate') {
    const orderExpr = buildFixedOrderCase(groupKeyExpr, BITRATE_BUCKETS.map((b) => b.key))
    return `CASE WHEN ${groupKeyExpr} = '#' THEN 1 ELSE 0 END ASC, ${orderExpr} ${dirSql}`
  }
  if (groupBy === 'resolution') {
    const orderExpr = buildFixedOrderCase(groupKeyExpr, ['sd', '720p', '1080p', '1440p', '2160p'])
    return `CASE WHEN ${groupKeyExpr} = '#' THEN 1 ELSE 0 END ASC, ${orderExpr} ${dirSql}`
  }
  if (groupBy === 'rating' || groupBy === 'fps') {
    return `CASE WHEN ${groupKeyExpr} = '#' THEN 1 ELSE 0 END ASC, CAST(${groupKeyExpr} AS REAL) ${dirSql}`
  }

  if (groupBy === 'dateDay' || groupBy === 'dateMonth' || groupBy === 'dateYear') {
    // Lexicographic YYYY / YYYY-MM / YYYY-MM-DD matches chronological order.
    return `CASE WHEN ${groupKeyExpr} = '#' THEN 1 ELSE 0 END ASC, ${groupKeyExpr} ${dirSql}`
  }

  if (groupBy === 'pinnedMeta' && isNumericMetaType(options.metaType)) {
    return `CASE WHEN ${groupKeyExpr} = '#' THEN 1 ELSE 0 END ASC, CAST(${groupKeyExpr} AS REAL) ${dirSql}`
  }

  if (groupBy === 'pinnedMeta' && isTagMetaType(options.metaType) && options.labelExpr) {
    // Sort by tag name, not tag id string.
    return `CASE WHEN ${groupKeyExpr} = '#' THEN 1 ELSE 0 END ASC, ${options.labelExpr} COLLATE NOCASE ${dirSql}`
  }

  // path / diskRoot / firstLetter / codec / ext / pinnedMeta values — localeCompare-ish via NOCASE; '#' last.
  return `CASE WHEN ${groupKeyExpr} = '#' THEN 1 ELSE 0 END ASC, ${groupKeyExpr} COLLATE NOCASE ${dirSql}`
}

export function labelForMediaGroupKey(
  groupBy: ItemsGroupBy,
  key: string,
  sortBy: unknown = 'id',
  options: {
    metaId?: number | null
    metaType?: string | null
    resolveTagName?: (tagId: number) => string
    groupLabel?: string | null
  } = {},
): string {
  if (options.groupLabel != null && options.groupLabel !== '') {
    if (groupBy === 'pinnedMeta' && key === '#') {
      return getItemPinnedMetaGroup({}, options.metaId, options.metaType).label
    }
    if (groupBy === 'pinnedMeta' && key !== '#') {
      return String(options.groupLabel)
    }
  }

  if (groupBy === 'pinnedMeta') {
    const stub = stubItemForGroupKey(groupBy, key, options)
    return getGroupKeyAndLabel(stub, groupBy, sortBy, {
      metaId: options.metaId,
      metaType: options.metaType,
      resolveTagName: options.resolveTagName,
    }).label
  }

  // Reuse shared label rules via a stub item that yields the same key.
  const stub = stubItemForGroupKey(groupBy, key)
  return getGroupKeyAndLabel(stub, groupBy, sortBy).label
}

function stubItemForGroupKey(
  groupBy: ItemsGroupBy,
  key: string,
  options: {
    metaId?: number | null
    metaType?: string | null
    resolveTagName?: (tagId: number) => string
  } = {},
): Record<string, unknown> {
  switch (groupBy) {
    case 'rating':
      return {rating: key === '0' ? 0 : Number(key)}
    case 'favorite':
      return {favorite: key === '1' ? 1 : 0}
    case 'ext':
      return {ext: key === '#' ? '' : key}
    case 'path':
      return {path: key === '#' ? '' : `${key}/file.mp4`}
    case 'diskRoot':
      return {path: key === '#' ? '' : (key.endsWith('\\') || key.endsWith('/') ? `${key}a.mp4` : `${key}/a.mp4`)}
    case 'firstLetter':
      return {name: key === '#' ? '1abc' : `${key}ame`}
    case 'filesize': {
      const bucket = FILESIZE_BUCKETS.find((entry) => entry.key === key)
      if (!bucket) return {filesize: -1}
      if (bucket.maxExclusive == null) return {filesize: 50 * 1024 * 1024 * 1024}
      return {filesize: Math.max(0, bucket.maxExclusive - 1)}
    }
    case 'duration': {
      const samples: Record<string, number> = {
        lt1m: 30,
        '1_10m': 120,
        '10_30m': 900,
        '30_60m': 2400,
        '1_2h': 5400,
        '2_3h': 9000,
        '3_5h': 14400,
        '5_10h': 21600,
        gte10h: 40000,
      }
      return {duration: key === '#' ? -1 : samples[key] ?? -1}
    }
    case 'views': {
      const bucket = VIEWS_BUCKETS.find((entry) => entry.key === key)
      if (!bucket) return {views: -1}
      if (bucket.maxExclusive == null) return {views: 1001}
      return {views: Math.max(0, bucket.maxExclusive - 1)}
    }
    case 'codec':
      return {codec: key === '#' ? '' : key}
    case 'fps':
      return {fps: key === '#' ? 0 : Number(key)}
    case 'bitrate': {
      const bucket = BITRATE_BUCKETS.find((entry) => entry.key === key)
      if (!bucket) return {bitrate: 0}
      if (bucket.maxExclusive == null) return {bitrate: 50_000_000}
      return {bitrate: Math.max(1, bucket.maxExclusive - 1)}
    }
    case 'resolution': {
      const samples: Record<string, {width: number; height: number}> = {
        sd: {width: 640, height: 480},
        '720p': {width: 1280, height: 720},
        '1080p': {width: 1920, height: 1080},
        '1440p': {width: 2560, height: 1440},
        '2160p': {width: 3840, height: 2160},
      }
      return key === '#' ? {width: 0, height: 0} : samples[key] || {width: 0, height: 0}
    }
    case 'dateYear':
      return key === '#' ? {createdAt: null} : {createdAt: `${key}-06-15T12:00:00.000Z`}
    case 'dateMonth':
      return key === '#' ? {createdAt: null} : {createdAt: `${key}-15T12:00:00.000Z`}
    case 'dateDay':
      return key === '#' ? {createdAt: null} : {createdAt: `${key}T12:00:00.000Z`}
    case 'pinnedMeta': {
      const metaId = Number(options.metaId)
      if (!Number.isFinite(metaId) || key === '#') {
        return {tags: [], values: []}
      }
      if (isTagMetaType(options.metaType)) {
        const tagId = Number(key)
        return {
          tags: Number.isFinite(tagId) ? [{tagId, metaId}] : [],
          values: [],
        }
      }
      return {
        tags: [],
        values: [{metaId, value: key}],
      }
    }
    default:
      return {}
  }
}

export function buildMediaGroupSummariesFromRows(
  rows: Array<{groupKey?: unknown; count?: unknown; groupLabel?: unknown}>,
  groupBy: ItemsGroupBy,
  sortBy: unknown,
  direction: string | null | undefined,
  options: {
    metaId?: number | null
    metaType?: string | null
    resolveTagName?: (tagId: number) => string
  } = {},
): ItemsGroupSummary[] {
  const summaries = rows.map((row) => {
    const key = String(row.groupKey ?? '#')
    const groupLabel = row.groupLabel == null ? null : String(row.groupLabel)
    const label = labelForMediaGroupKey(groupBy, key, sortBy, {
      ...options,
      groupLabel,
    })
    const summary: ItemsGroupSummary = {
      key,
      label,
      count: Number(row.count) || 0,
    }

    if (groupBy === 'pinnedMeta' && options.metaId != null && Number.isFinite(Number(options.metaId))) {
      const stub = stubItemForGroupKey(groupBy, key, options)
      const {filter} = getItemPinnedMetaGroup(
        stub,
        options.metaId,
        options.metaType,
        {
          resolveTagName: options.resolveTagName
            || (groupLabel && key !== '#' ? () => groupLabel : undefined),
        },
      )
      summary.filter = filter
    }

    return summary
  })

  summaries.sort((a, b) => compareGroupKeys(groupBy, a.key, b.key, {
    direction,
    metaType: options.metaType,
    labelA: a.label,
    labelB: b.label,
    resolveTagName: options.resolveTagName,
  }))

  return summaries
}

export function buildMediaGroupSummarySql(
  groupKeyExpr: string,
  fromForSort: string,
  whereClause: string,
  options: {labelExpr?: string} = {},
): string {
  const labelSelect = options.labelExpr
    ? `, MAX(${options.labelExpr}) AS groupLabel`
    : ''
  return `SELECT ${groupKeyExpr} AS groupKey, COUNT(DISTINCT media.id) AS count${labelSelect}
    ${fromForSort}
    ${whereClause}
    GROUP BY groupKey`
}

export function buildMediaGroupedIdOrderSql(
  idSelect: string,
  fromForSort: string,
  whereClause: string,
  groupOrderExpr: string,
  sortExpr: string,
  sortDir: 'ASC' | 'DESC',
): string {
  return `${idSelect}
    ${fromForSort}
    ${whereClause}
    ORDER BY ${groupOrderExpr}, ${sortExpr} ${sortDir}`
}
