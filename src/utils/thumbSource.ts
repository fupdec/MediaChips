import path from 'path-browserify'
import { buildLocalFileUrl } from '@/services/fileService'
import {
  getCachedThumb,
  isPersistentThumbUrl,
  mediaThumbKey,
  tagThumbKey,
} from '@/utils/thumbDisplayCache'

export type MediaThumbSubfolder = 'thumbs' | 'grids'

export function isThumbUnavailable(src: string | null | undefined): boolean {
  return !src || src.includes('unavailable.png')
}

export function resolveTagThumbDisplayUrl({
  dbPath,
  metaId,
  tagId,
  type,
}: {
  dbPath: string
  metaId: number | string
  tagId: number | string
  type: string
}): string {
  const cached = getCachedThumb(tagThumbKey(metaId, tagId, type))
  if (isPersistentThumbUrl(cached)) return cached!

  return buildLocalFileUrl(path.join(
    dbPath,
    'meta',
    String(metaId),
    `${tagId}_${type}.jpg`,
  ))
}

export function resolveMediaThumbDisplayUrl(
  mediaPath: string,
  mediaTypeFolder: string,
  id: number | string,
  subfolder: MediaThumbSubfolder = 'thumbs',
): string | null {
  if (!mediaPath || id == null) return null

  const cached = getCachedThumb(mediaThumbKey(mediaTypeFolder, id))
  if (isPersistentThumbUrl(cached)) return cached!

  return buildLocalFileUrl(path.join(
    mediaPath,
    mediaTypeFolder,
    subfolder,
    `${id}.jpg`,
  ))
}

export function resolveTimelineFrameDisplayUrl(
  mediaPath: string,
  mediaId: number | string,
  progressValue: number,
  cacheBust = false,
): string {
  return buildLocalFileUrl(path.join(
    mediaPath,
    'videos/timelines',
    `${mediaId}_${progressValue}.jpg`,
  ), false, cacheBust)
}
