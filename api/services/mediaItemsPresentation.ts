import type {AnyRecord} from '../types/db'
import type {
  LoadedMediaItem,
  MediaLoadOptions,
  NavigationMediaItem,
} from '../types/mediaFilter'

export type MediaTagLinkRow = {
  tagId: number
  metaId: number
  fromFolder?: boolean
}

export function pushUniqueTagLink(
  map: Map<number, MediaTagLinkRow[]>,
  mediaId: number,
  tagId: number,
  metaId: number,
  fromFolder = false,
) {
  if (!Number.isFinite(mediaId) || !Number.isFinite(tagId) || !Number.isFinite(metaId)) return
  if (!map.has(mediaId)) map.set(mediaId, [])
  const list = map.get(mediaId)!
  if (list.some((row) => row.tagId === tagId && row.metaId === metaId)) return
  list.push(fromFolder ? {tagId, metaId, fromFolder: true} : {tagId, metaId})
}

export function usesVisualNearDuplicates(options: MediaLoadOptions = {}) {
  if (!options.find_duplicates) return false
  const duplicatesBy = String(options.duplicates_by || '')
  return duplicatesBy === 'visualHash'
    || duplicatesBy === 'visual'
    || duplicatesBy === 'visualHashNear'
}

export function toNavigationItem(item: NavigationMediaItem) {
  return {
    id: item.id,
    path: item.path,
    name: item.name,
    basename: item.basename,
    ext: item.ext,
    mediaTypeId: item.mediaTypeId,
    filesize: item.filesize,
    width: item.width,
    height: item.height,
    duration: item.duration,
    rating: item.rating,
    favorite: item.favorite,
    views: item.views,
    viewedAt: item.viewedAt,
    time: item.time,
  }
}

export function createItemShell(row: AnyRecord): LoadedMediaItem {
  return {
    ...row,
    tags: [],
    values: [],
    key: String(row.id),
  }
}
