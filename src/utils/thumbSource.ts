import path from 'path-browserify'
import { buildLocalFileUrl } from '@/services/fileService'
import {
  getCachedThumb,
  getTagThumbVersion,
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
  cacheBust = false,
}: {
  dbPath: string
  metaId: number | string
  tagId: number | string
  type: string
  cacheBust?: boolean | number
}): string {
  const version = getTagThumbVersion(metaId, tagId)
  const bustToken: boolean | number = cacheBust === true
    ? true
    : (typeof cacheBust === 'number' ? cacheBust : (version ?? false))

  if (!bustToken) {
    const cached = getCachedThumb(tagThumbKey(metaId, tagId, type))
    if (isPersistentThumbUrl(cached)) return cached!
  }

  return buildLocalFileUrl(path.join(
    dbPath,
    'meta',
    String(metaId),
    `${tagId}_${type}.jpg`,
  ), false, bustToken)
}

export interface TagHoverThumbCandidate {
  type: string
  url: string
}

const TAG_HOVER_THUMB_TYPES = ['avatar', 'main'] as const

export function getTagHoverThumbCandidates({
  dbPath,
  metaId,
  tagId,
}: {
  dbPath: string
  metaId: number | string
  tagId: number | string
}): TagHoverThumbCandidate[] {
  const candidates: TagHoverThumbCandidate[] = []
  const seen = new Set<string>()

  const version = getTagThumbVersion(metaId, tagId)

  for (const type of TAG_HOVER_THUMB_TYPES) {
    const cached = getCachedThumb(tagThumbKey(metaId, tagId, type))
    const cachedIsCurrent = !version || String(cached).includes('_t=')
    if (cached && cachedIsCurrent && !isThumbUnavailable(cached) && !seen.has(cached)) {
      seen.add(cached)
      candidates.push({type, url: cached})
      continue
    }

    const url = resolveTagThumbDisplayUrl({dbPath, metaId, tagId, type})
    if (!isThumbUnavailable(url) && !seen.has(url)) {
      seen.add(url)
      candidates.push({type, url})
    }
  }

  return candidates
}

export function resolveMediaThumbDisplayUrl(
  mediaPath: string,
  mediaTypeFolder: string,
  id: number | string,
  subfolder: MediaThumbSubfolder = 'thumbs',
): string | null {
  if (!mediaPath || id == null) return null

  const cached = getCachedThumb(
    mediaTypeFolder === 'videos'
      ? mediaThumbKey(mediaTypeFolder, id, subfolder)
      : mediaThumbKey(mediaTypeFolder, id),
  )
  if (isPersistentThumbUrl(cached)) return cached!

  return buildLocalFileUrl(path.join(
    mediaPath,
    mediaTypeFolder,
    subfolder,
    `${id}.jpg`,
  ))
}

export function resolveGridSpriteDisplayUrl(
  mediaPath: string,
  mediaId: number | string,
  cacheBust = false,
): string | null {
  if (!mediaPath || mediaId == null) return null

  const cached = getCachedThumb(mediaThumbKey('videos', mediaId, 'grids'))
  if (!cacheBust && isPersistentThumbUrl(cached)) return cached!

  return buildLocalFileUrl(path.join(
    mediaPath,
    'videos',
    'grids',
    `${mediaId}.jpg`,
  ), false, cacheBust)
}
