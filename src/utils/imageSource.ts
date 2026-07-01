import path from 'path-browserify'
import { getLocalImage } from '@/services/fileService'
import { getCachedThumb, mediaThumbKey, isPersistentThumbUrl, setCachedThumb } from '@/utils/thumbDisplayCache'

export const IMAGE_UNAVAILABLE_URL = '/images/unavailable.png'

interface MediaWithPath {
  id?: number
  path?: string
}

const isUnavailable = (src: string | null | undefined): boolean => !src || src.includes('unavailable.png')

const rememberImageThumb = (mediaId: number | string, src: string | null | undefined) => {
  if (!isPersistentThumbUrl(src)) return
  setCachedThumb(mediaThumbKey('images', mediaId), src)
}

export async function loadImageDisplayUrl(
  media: MediaWithPath | null | undefined,
  mediaPath: string,
  { preferFull = false, cacheBust = false } = {},
): Promise<string> {
  if (!media?.id) return IMAGE_UNAVAILABLE_URL

  if (!cacheBust) {
    const cached = getCachedThumb(mediaThumbKey('images', media.id))
    if (isPersistentThumbUrl(cached)) return cached!
  }

  const thumbPath = path.join(mediaPath, 'images/thumbs', `${media.id}.jpg`)

  // 1. Original (only when caller prefers full-size preview)
  if (preferFull && media.path) {
    const full = await getLocalImage(media.path, true, cacheBust)
    if (!isUnavailable(full)) {
      rememberImageThumb(media.id, full)
      return full
    }
  }

  // 2. Generated thumbnail
  const thumb = await getLocalImage(thumbPath, false, cacheBust)
  if (!isUnavailable(thumb)) {
    rememberImageThumb(media.id, thumb)
    return thumb
  }

  // 3. Original file
  if (media.path) {
    const full = await getLocalImage(media.path, true, cacheBust)
    if (!isUnavailable(full)) {
      rememberImageThumb(media.id, full)
      return full
    }
  }

  return IMAGE_UNAVAILABLE_URL
}

export async function loadThumbDisplayUrl(
  media: MediaWithPath | null | undefined,
  mediaPath: string,
): Promise<string> {
  if (!media?.id) return IMAGE_UNAVAILABLE_URL

  const thumbPath = path.join(mediaPath, 'images/thumbs', `${media.id}.jpg`)
  const thumb = await getLocalImage(thumbPath)
  if (!isUnavailable(thumb)) return thumb

  if (media.path) {
    const full = await getLocalImage(media.path, true)
    if (!isUnavailable(full)) return full
  }

  return IMAGE_UNAVAILABLE_URL
}

export async function loadFullImageDisplayUrl(media: MediaWithPath | null | undefined): Promise<string> {
  if (!media?.path) return IMAGE_UNAVAILABLE_URL

  const full = await getLocalImage(media.path, true)
  return isUnavailable(full) ? IMAGE_UNAVAILABLE_URL : full
}

export function revokeImageObjectUrl(url: string | null | undefined): void {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}
