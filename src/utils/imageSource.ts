import path from 'path-browserify'
import { buildLocalFileUrl } from '@/services/fileService'
import { getCachedThumb, mediaThumbKey, isPersistentThumbUrl, setCachedThumb } from '@/utils/thumbDisplayCache'

export const IMAGE_UNAVAILABLE_URL = '/images/unavailable.png'

interface MediaWithPath {
  id?: number
  path?: string
}

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

  if (!cacheBust && !preferFull) {
    const cached = getCachedThumb(mediaThumbKey('images', media.id))
    if (isPersistentThumbUrl(cached)) return cached!
  }

  if (preferFull && media.path) {
    const full = buildLocalFileUrl(media.path, true, cacheBust)
    rememberImageThumb(media.id, full)
    return full
  }

  const thumbPath = path.join(mediaPath, 'images/thumbs', `${media.id}.jpg`)
  return buildLocalFileUrl(thumbPath, false, cacheBust)
}

export async function loadThumbDisplayUrl(
  media: MediaWithPath | null | undefined,
  mediaPath: string,
): Promise<string> {
  if (!media?.id) return IMAGE_UNAVAILABLE_URL

  const thumbPath = path.join(mediaPath, 'images/thumbs', `${media.id}.jpg`)
  return buildLocalFileUrl(thumbPath)
}

export async function loadFullImageDisplayUrl(media: MediaWithPath | null | undefined): Promise<string> {
  if (!media?.path) return IMAGE_UNAVAILABLE_URL

  return buildLocalFileUrl(media.path, true)
}

export function revokeImageObjectUrl(url: string | null | undefined): void {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}
