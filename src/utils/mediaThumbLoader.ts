import path from 'path-browserify'
import { getLocalImage } from '@/services/fileService'
import { typedApi } from '@/services/typedApi'
import { mapWithConcurrency } from '@/utils/mapWithConcurrency'

const THUMB_SUBFOLDERS = ['thumbs', 'grids'] as const
const UNAVAILABLE_MARKER = 'unavailable.png'
const INDIVIDUAL_LOAD_CONCURRENCY = 8

export async function loadMediaThumbUrl(
  mediaPath: string,
  mediaTypeFolder: string,
  id: number | string,
): Promise<string | null> {
  if (!mediaPath || id == null) return null

  for (const subfolder of THUMB_SUBFOLDERS) {
    const imgPath = path.join(mediaPath, mediaTypeFolder, subfolder, `${id}.jpg`)
    const url = await getLocalImage(imgPath)
    if (url && !url.includes(UNAVAILABLE_MARKER)) {
      return url
    }
  }

  return null
}

async function loadMediaThumbUrlsIndividually(
  mediaPath: string,
  mediaTypeFolder: string,
  ids: Array<number | string>,
): Promise<Record<number | string, string>> {
  const thumbs: Record<number | string, string> = {}

  const entries = await mapWithConcurrency(ids, INDIVIDUAL_LOAD_CONCURRENCY, async (id) => {
    const url = await loadMediaThumbUrl(mediaPath, mediaTypeFolder, id)
    return url ? [id, url] as const : null
  })

  for (const entry of entries) {
    if (entry) {
      const [id, url] = entry
      thumbs[id] = url
    }
  }

  return thumbs
}

export async function loadMediaThumbUrls(
  mediaPath: string,
  mediaTypeFolder: string,
  ids: Array<number | string>,
): Promise<Record<number | string, string>> {
  const uniqueIds = [...new Set(ids.filter((id) => id != null))]
  if (!uniqueIds.length) return {}

  try {
    const response = await typedApi.postMediaThumbs({
      ids: uniqueIds,
      mediaType: mediaTypeFolder,
    })
    const rawThumbs = response.data?.thumbs ?? {}
    const thumbs: Record<number | string, string> = {}

    for (const id of uniqueIds) {
      const value = rawThumbs[id] ?? rawThumbs[String(id)]
      if (typeof value === 'string' && value) {
        thumbs[id] = value
      }
    }

    return thumbs
  } catch {
    if (!mediaPath) return {}
    return loadMediaThumbUrlsIndividually(mediaPath, mediaTypeFolder, uniqueIds)
  }
}
