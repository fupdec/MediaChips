import type {ApiDb, AnyRecord} from '../types/db'
import type {
  LoadedMediaItem,
  MediaId,
  NavigationMediaItem,
} from '../types/mediaFilter'
import {queryAllAsync} from '../db/utils/rawQuery'
import {chunkArray} from '../db/utils/chunk'
import {createMetaRepository} from '../db/repositories/meta'
import {
  aggregateGroupedItems,
  resolveDateGroupField,
  type BuildItemGroupsOptions,
  type GroupableItem,
  type ItemsGroupBy,
  type ItemsGroupSummary,
} from '../../shared/itemsGroupBy'
import {
  pushUniqueTagLink,
  type MediaTagLinkRow,
} from './mediaItemsPresentation'
import {loadInheritedFolderTagsForMediaRows} from './mediaInheritedFolderTags'

export const GROUP_SLIM_SELECT = `SELECT
  media.id,
  media.path,
  media.name,
  media.basename,
  media.ext,
  media.mediaTypeId,
  media.filesize,
  media.rating,
  media.favorite,
  media.views,
  media.viewedAt,
  media.createdAt,
  media.updatedAt,
  media.mediaCreatedAt,
  COALESCE(videoMetadata.width, imageMetadata.width) AS width,
  COALESCE(videoMetadata.height, imageMetadata.height) AS height,
  videoMetadata.duration,
  videoMetadata.bitrate,
  videoMetadata.codec,
  videoMetadata.fps,
  videoMetadata.time`

type GroupSlimColumn =
  | 'id'
  | 'path'
  | 'name'
  | 'basename'
  | 'ext'
  | 'mediaTypeId'
  | 'filesize'
  | 'rating'
  | 'favorite'
  | 'views'
  | 'viewedAt'
  | 'createdAt'
  | 'updatedAt'
  | 'mediaCreatedAt'
  | 'width'
  | 'height'
  | 'duration'
  | 'bitrate'
  | 'codec'
  | 'fps'
  | 'time'

const GROUP_SLIM_COLUMN_ORDER: GroupSlimColumn[] = [
  'id',
  'path',
  'name',
  'basename',
  'ext',
  'mediaTypeId',
  'filesize',
  'rating',
  'favorite',
  'views',
  'viewedAt',
  'createdAt',
  'updatedAt',
  'mediaCreatedAt',
  'width',
  'height',
  'duration',
  'bitrate',
  'codec',
  'fps',
  'time',
]

const GROUP_SLIM_COLUMN_SQL: Record<GroupSlimColumn, string> = {
  id: 'media.id',
  path: 'media.path',
  name: 'media.name',
  basename: 'media.basename',
  ext: 'media.ext',
  mediaTypeId: 'media.mediaTypeId',
  filesize: 'media.filesize',
  rating: 'media.rating',
  favorite: 'media.favorite',
  views: 'media.views',
  viewedAt: 'media.viewedAt',
  createdAt: 'media.createdAt',
  updatedAt: 'media.updatedAt',
  mediaCreatedAt: 'media.mediaCreatedAt',
  width: 'COALESCE(videoMetadata.width, imageMetadata.width) AS width',
  height: 'COALESCE(videoMetadata.height, imageMetadata.height) AS height',
  duration: 'videoMetadata.duration',
  bitrate: 'videoMetadata.bitrate',
  codec: 'videoMetadata.codec',
  fps: 'videoMetadata.fps',
  time: 'videoMetadata.time',
}

const METADATA_GROUP_SLIM_COLUMNS = new Set<GroupSlimColumn>([
  'width',
  'height',
  'duration',
  'bitrate',
  'codec',
  'fps',
  'time',
])

function columnsForGroupBy(
  groupBy: ItemsGroupBy,
  sortBy: unknown,
): GroupSlimColumn[] | null {
  switch (groupBy) {
    case 'firstLetter':
      return ['name']
    case 'dateMonth':
    case 'dateYear':
    case 'dateDay':
      return [resolveDateGroupField(sortBy)]
    case 'rating':
      return ['rating']
    case 'favorite':
      return ['favorite']
    case 'path':
    case 'diskRoot':
      return ['path']
    case 'ext':
      return ['ext']
    case 'filesize':
      return ['filesize']
    case 'duration':
      return ['duration']
    case 'views':
      return ['views']
    case 'codec':
      return ['codec']
    case 'fps':
      return ['fps']
    case 'bitrate':
      return ['bitrate']
    case 'resolution':
      return ['width', 'height']
    case 'pinnedMeta':
    case 'none':
    default:
      return null
  }
}

function columnsForSort(sortBy: unknown): GroupSlimColumn[] {
  const key = String(sortBy || 'id')
  if (key === 'id' || key === 'shuffle' || key === 'bookmark') return []
  if ((GROUP_SLIM_COLUMN_ORDER as string[]).includes(key)) {
    return [key as GroupSlimColumn]
  }
  return []
}

function collectGroupSlimColumns(
  groupBy: ItemsGroupBy,
  sortBy: unknown,
): GroupSlimColumn[] | null {
  const groupCols = columnsForGroupBy(groupBy, sortBy)
  if (!groupCols) return null
  const cols = new Set<GroupSlimColumn>(['id', ...groupCols, ...columnsForSort(sortBy)])
  return GROUP_SLIM_COLUMN_ORDER.filter((column) => cols.has(column))
}

/** Slim SELECT for grouping: only id + group/sort columns (full set for pinnedMeta). */
export function buildGroupSlimSelect(
  groupBy: ItemsGroupBy,
  sortBy: unknown = 'id',
): string {
  const columns = collectGroupSlimColumns(groupBy, sortBy)
  if (!columns) return GROUP_SLIM_SELECT
  return `SELECT\n  ${columns.map((column) => GROUP_SLIM_COLUMN_SQL[column]).join(',\n  ')}`
}

/** Whether the pruned grouping SELECT needs video/image metadata joins. */
export function groupSlimNeedsMetadataJoin(
  groupBy: ItemsGroupBy,
  sortBy: unknown = 'id',
): boolean {
  const columns = collectGroupSlimColumns(groupBy, sortBy)
  if (!columns) return true
  return columns.some((column) => METADATA_GROUP_SLIM_COLUMNS.has(column))
}

/** List/inspector hydrate — omit fingerprint/hash blobs (use dedicated queries for those). */
export const MEDIA_BASE_SELECT = `SELECT
  media.id,
  media.path,
  media.basename,
  media.name,
  media.ext,
  media.filesize,
  media.rating,
  media.favorite,
  media.bookmark,
  media.views,
  media.viewedAt,
  media.mediaTypeId,
  media.createdAt,
  media.updatedAt,
  media.mediaCreatedAt,
  videoMetadata.duration,
  videoMetadata.bitrate,
  videoMetadata.codec,
  videoMetadata.fps,
  videoMetadata.time,
  videoMetadata.title,
  videoMetadata.artist,
  videoMetadata.album,
  COALESCE(videoMetadata.width, imageMetadata.width) AS width,
  COALESCE(videoMetadata.height, imageMetadata.height) AS height,
  imageMetadata.orientation,
  textContent.excerpt AS textExcerpt
FROM media
LEFT JOIN videoMetadata ON media.id = videoMetadata.mediaId
LEFT JOIN imageMetadata ON media.id = imageMetadata.mediaId
LEFT JOIN textContent ON media.id = textContent.mediaId`

export async function attachPinnedMetaForGrouping(
  db: ApiDb,
  items: GroupableItem[],
  metaId: number,
  metaType: string | null | undefined,
): Promise<BuildItemGroupsOptions> {
  const mediaIds = items
    .map((item) => Number(item.id))
    .filter((id) => Number.isFinite(id))
  if (!mediaIds.length) {
    return {metaId, metaType: metaType || null}
  }

  const type = String(metaType || '')
  const isTagMeta = !type || type === 'array' || type === 'select'
  const tagsByMediaId = new Map<number, MediaTagLinkRow[]>()
  const valuesByMediaId = new Map<number, Array<{metaId: number; value: unknown}>>()
  const tagNameById = new Map<number, string>()

  for (const chunk of chunkArray(mediaIds)) {
    if (isTagMeta) {
      const tagRows = await queryAllAsync(db,
        `SELECT mediaId, tagId, metaId FROM tagsInMedia
         WHERE mediaId IN (:mediaIds) AND metaId = :metaId`,
        {mediaIds: chunk, metaId},
      )
      for (const row of tagRows) {
        pushUniqueTagLink(
          tagsByMediaId,
          Number(row.mediaId),
          Number(row.tagId),
          Number(row.metaId),
        )
      }
    } else {
      const valueRows = await queryAllAsync(db,
        `SELECT mediaId, value, metaId FROM valuesInMedia
         WHERE mediaId IN (:mediaIds) AND metaId = :metaId`,
        {mediaIds: chunk, metaId},
      )
      for (const row of valueRows) {
        const mediaId = Number(row.mediaId)
        if (!Number.isFinite(mediaId)) continue
        if (!valuesByMediaId.has(mediaId)) valuesByMediaId.set(mediaId, [])
        valuesByMediaId.get(mediaId)!.push({
          metaId: Number(row.metaId),
          value: row.value,
        })
      }
    }
  }

  if (isTagMeta) {
    const inherited = await loadInheritedFolderTagsForMediaRows(db, items, metaId)
    for (const row of inherited) {
      pushUniqueTagLink(tagsByMediaId, row.mediaId, row.tagId, row.metaId, true)
    }
  }

  if (isTagMeta && tagsByMediaId.size) {
    const tagIds = [...new Set(
      [...tagsByMediaId.values()].flatMap((rows) => rows.map((row) => row.tagId)),
    )]
    for (const chunk of chunkArray(tagIds)) {
      const nameRows = await queryAllAsync(db,
        `SELECT id, name FROM tags WHERE id IN (:ids)`,
        {ids: chunk},
      )
      for (const row of nameRows) {
        tagNameById.set(Number(row.id), String(row.name || ''))
      }
    }
  }

  for (const item of items) {
    const id = Number(item.id)
    item.tags = tagsByMediaId.get(id) || []
    item.values = valuesByMediaId.get(id) || []
  }

  return {
    metaId,
    metaType: metaType || (isTagMeta ? 'array' : 'string'),
    resolveTagName: (tagId) => tagNameById.get(Number(tagId)) || `#${tagId}`,
  }
}

export async function buildMediaGroupsFromSlimRows(
  db: ApiDb,
  slimRows: AnyRecord[],
  groupBy: ItemsGroupBy,
  sortBy: unknown,
  groupMetaId: number | null,
  groupByMetaType?: string | null,
  direction?: string | null,
): Promise<{groups: ItemsGroupSummary[]; orderedIds: number[]}> {
  const items = slimRows.map((row) => ({...row})) as GroupableItem[]
  let options: BuildItemGroupsOptions = {
    metaId: groupMetaId,
    metaType: groupByMetaType || null,
    direction: direction || 'asc',
  }

  if (groupBy === 'pinnedMeta' && groupMetaId != null) {
    let metaType = groupByMetaType || null
    if (!metaType) {
      const metaRepo = createMetaRepository(db.drizzle)
      metaType = metaRepo.findById(groupMetaId)?.type || 'array'
    }
    options = {
      ...(await attachPinnedMetaForGrouping(db, items, groupMetaId, metaType)),
      direction: direction || 'asc',
    }
  }

  return aggregateGroupedItems(items, groupBy, sortBy, options)
}

export async function fetchBaseMediaRows(
  db: ApiDb,
  mediaTypeId: MediaId | null | undefined,
  ids: MediaId[] = [],
) {
  if (ids.length) {
    return queryAllAsync(db,
      `${MEDIA_BASE_SELECT} WHERE media.id IN (:ids)`,
      {ids},
    )
  }

  if (!mediaTypeId) return []

  return queryAllAsync(db,
    `${MEDIA_BASE_SELECT} WHERE media.mediaTypeId = :mediaTypeId`,
    {mediaTypeId},
  )
}

export async function attachMediaRelations(
  db: ApiDb,
  items: LoadedMediaItem[],
  mediaTypeId: MediaId | null | undefined,
  ids: MediaId[] = [],
) {
  if (!items.length) return items

  const mediaIds = items.map((item: LoadedMediaItem | NavigationMediaItem | AnyRecord) => item.id)
  const idSet = new Set(mediaIds)
  const useIdFilter = ids.length > 0

  const tagQuery = useIdFilter
    ? `SELECT mediaId, tagId, metaId FROM tagsInMedia WHERE mediaId IN (:mediaIds)`
    : `SELECT tim.mediaId, tim.tagId, tim.metaId
       FROM tagsInMedia tim
       INNER JOIN media m ON m.id = tim.mediaId
       WHERE m.mediaTypeId = :mediaTypeId`

  const valueQuery = useIdFilter
    ? `SELECT mediaId, value, metaId FROM valuesInMedia WHERE mediaId IN (:mediaIds)`
    : `SELECT vim.mediaId, vim.value, vim.metaId
       FROM valuesInMedia vim
       INNER JOIN media m ON m.id = vim.mediaId
       WHERE m.mediaTypeId = :mediaTypeId`

  const replacements = useIdFilter
    ? {mediaIds}
    : {mediaTypeId}

  // Tags, values, and folder-inherited tags are independent — fetch in parallel.
  const [tagRows, valueRows, inherited] = await Promise.all([
    queryAllAsync(db, tagQuery, replacements),
    queryAllAsync(db, valueQuery, replacements),
    loadInheritedFolderTagsForMediaRows(db, items),
  ])

  const tagsByMediaId = new Map<number, MediaTagLinkRow[]>()
  const valuesByMediaId = new Map()

  for (const row of tagRows) {
    if (!idSet.has(row.mediaId)) continue
    pushUniqueTagLink(
      tagsByMediaId,
      Number(row.mediaId),
      Number(row.tagId),
      Number(row.metaId),
    )
  }

  for (const row of valueRows) {
    if (!idSet.has(row.mediaId)) continue
    if (!valuesByMediaId.has(row.mediaId)) valuesByMediaId.set(row.mediaId, [])
    valuesByMediaId.get(row.mediaId).push({
      value: row.value,
      metaId: Number(row.metaId),
    })
  }

  for (const row of inherited) {
    if (!idSet.has(row.mediaId)) continue
    pushUniqueTagLink(tagsByMediaId, row.mediaId, row.tagId, row.metaId, true)
  }

  for (const item of items) {
    item.tags = tagsByMediaId.get(Number(item.id)) || []
    item.values = valuesByMediaId.get(item.id) || []
  }

  return items
}
