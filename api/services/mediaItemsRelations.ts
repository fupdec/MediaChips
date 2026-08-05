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
  COALESCE(videoMetadata.width, imageMetadata.width) AS width,
  COALESCE(videoMetadata.height, imageMetadata.height) AS height,
  videoMetadata.duration,
  videoMetadata.bitrate,
  videoMetadata.codec,
  videoMetadata.fps,
  videoMetadata.time`

const MEDIA_BASE_SELECT = `SELECT media.*,
  videoMetadata.duration,
  videoMetadata.bitrate,
  videoMetadata.codec,
  videoMetadata.fps,
  videoMetadata.time,
  COALESCE(videoMetadata.width, imageMetadata.width) AS width,
  COALESCE(videoMetadata.height, imageMetadata.height) AS height,
  imageMetadata.orientation
FROM media
LEFT JOIN videoMetadata ON media.id = videoMetadata.mediaId
LEFT JOIN imageMetadata ON media.id = imageMetadata.mediaId`

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

  const tagRows = await queryAllAsync(db, tagQuery, replacements)
  const valueRows = await queryAllAsync(db, valueQuery, replacements)

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

  const inherited = await loadInheritedFolderTagsForMediaRows(db, items)
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
