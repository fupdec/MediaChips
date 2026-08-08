import path from 'path-browserify'
import { buildLocalFileUrl } from '@/services/fileService'
import {
  getCachedThumb,
  mediaThumbKey,
  isPersistentThumbUrl,
  setCachedThumb,
} from '@/utils/thumbDisplayCache'

export const IMAGE_UNAVAILABLE_URL = '/images/unavailable.png'

interface MediaWithPath {
  id?: number
  path?: string
}

export async function loadImageDisplayUrl(
  media: MediaWithPath | null | undefined,
  mediaPath: string,
  { preferFull = false, cacheBust = false } = {},
): Promise<string> {
  if (!media?.id) return IMAGE_UNAVAILABLE_URL

  if (!cacheBust && !preferFull) {
    const cached = getCachedThumb(mediaThumbKey('images', media.id))
    if (isPersistentThumbUrl(cached)) return cached!
  }

  if (preferFull && media.path) {
    // Full originals are for viewers/editors only — never cache them as library thumbs.
    return buildLocalFileUrl(media.path, true, cacheBust)
  }

  const thumbPath = path.join(mediaPath, 'images/thumbs', `${media.id}.jpg`)
  return buildLocalFileUrl(thumbPath, false, cacheBust)
}

export async function loadThumbDisplayUrl(
  media: MediaWithPath | null | undefined,
  mediaPath: string,
): Promise<string> {
  if (!media?.id) return IMAGE_UNAVAILABLE_URL

  const key = mediaThumbKey('images', media.id)
  const cached = getCachedThumb(key)
  if (isPersistentThumbUrl(cached)) return cached!

  const thumbPath = path.join(mediaPath, 'images/thumbs', `${media.id}.jpg`)
  const url = buildLocalFileUrl(thumbPath)
  setCachedThumb(key, url)
  return url
}

/**
 * Filmstrip cells are ~72 CSS px; request a ~2× downscale from the 320px library thumb
 * so the strip does not decode full thumbs for every neighbor.
 */
export const FILMSTRIP_THUMB_MAX_EDGE = 144

export async function loadFilmstripThumbDisplayUrl(
  media: MediaWithPath | null | undefined,
  mediaPath: string,
): Promise<string> {
  if (!media?.id) return IMAGE_UNAVAILABLE_URL

  const key = mediaThumbKey('images-filmstrip', media.id)
  const cached = getCachedThumb(key)
  if (isPersistentThumbUrl(cached)) return cached!

  const thumbPath = path.join(mediaPath, 'images/thumbs', `${media.id}.jpg`)
  const url = buildLocalFileUrl(thumbPath, false, false, {maxEdge: FILMSTRIP_THUMB_MAX_EDGE})
  setCachedThumb(key, url)
  return url
}

/** Longest edge for ImageViewer / neighbor warm — full original loads on strong zoom. */
export const VIEWER_MAX_EDGE = 2048

export async function loadFullImageDisplayUrl(
  media: MediaWithPath | null | undefined,
  {maxEdge = VIEWER_MAX_EDGE as number | false} = {},
): Promise<string> {
  if (!media?.path) return IMAGE_UNAVAILABLE_URL

  if (maxEdge === false) {
    return buildLocalFileUrl(media.path, true)
  }

  return buildLocalFileUrl(media.path, true, false, {maxEdge})
}

export function revokeImageObjectUrl(url: string | null | undefined): void {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}
