import path from 'path-browserify'
import { typedApi } from '@/services/typedApi'
import { buildLocalFileUrl } from '@/services/fileService'
import { getMediaDeleteAssetFolder, findMediaTypeById, isImageMediaType, isVideoMediaType } from '@/utils/mediaType'
import { loadMediaThumbUrls } from '@/utils/mediaThumbLoader'
import { IMAGE_UNAVAILABLE_URL } from '@/utils/imageSource'
import { CARD_THUMB_MAX_EDGE, isThumbUnavailable } from '@/utils/thumbSource'
import { probeDisplayImageUrl } from '@/utils/probeImageUrl'
import { mapWithConcurrency } from '@/utils/mapWithConcurrency'
import {
  enqueueImageThumbAndMeta,
  enqueueQuietMetaBackfill,
  isEmptyMediaSource,
} from '@/utils/quietMediaBackfill'
import type { MediaType } from '@/types/media'

interface HomeMediaItem {
  id: number
  mediaTypeId?: number
  path?: string
  width?: number
  height?: number
  duration?: number
  filesize?: number
  thumb?: string | null
}

const PROBE_CONCURRENCY = 6
const CREATE_CONCURRENCY = 3

function getThumbMediaType(mediaTypes: MediaType[], mediaTypeId: number | undefined): string {
  const mediaType = mediaTypes.find((item) => item.id === Number(mediaTypeId))
  return getMediaDeleteAssetFolder(mediaType) || 'videos'
}

function buildBustedThumbUrl(
  mediaPath: string,
  folder: string,
  id: number,
): string {
  return buildLocalFileUrl(
    path.join(mediaPath, folder, 'thumbs', `${id}.jpg`),
    false,
    Date.now(),
    {maxEdge: CARD_THUMB_MAX_EDGE},
  )
}

async function ensureHomeItemThumb(
  item: HomeMediaItem,
  mediaTypes: MediaType[],
  mediaPath: string,
  folder: string,
): Promise<string | null> {
  if (isEmptyMediaSource(item)) return null

  const mediaType = findMediaTypeById(mediaTypes, item.mediaTypeId)

  if (isImageMediaType(mediaType)) {
    const ok = await enqueueImageThumbAndMeta(item.id)
    if (!ok) return null
  } else if (isVideoMediaType(mediaType)) {
    if (!item.path) return null
    try {
      await typedApi.taskCreateThumbForVideo({
        path: String(item.path),
        id: item.id,
      })
    } catch {
      return null
    }
    // Lite video rows often lack duration/resolution — fill quietly.
    if ((Number(item.duration) || 0) <= 0 || (Number(item.width) || 0) <= 0) {
      void enqueueQuietMetaBackfill(item.id)
    }
  } else {
    return null
  }

  const url = buildBustedThumbUrl(mediaPath, folder, item.id)
  if (await probeDisplayImageUrl(url)) return url
  return null
}

/**
 * Resolve home-widget thumbs. Missing files after fast/lite import are created
 * quietly, then the card URL is updated so widgets paint without a task dialog.
 */
export async function loadHomeMediaThumbs(
  items: HomeMediaItem[],
  mediaTypes: MediaType[],
  mediaPath: string,
): Promise<void> {
  if (!items?.length || !mediaPath) return

  const grouped = new Map<string, HomeMediaItem[]>()

  for (const item of items) {
    const folder = getThumbMediaType(mediaTypes, item.mediaTypeId)
    const group = grouped.get(folder) ?? []
    group.push(item)
    grouped.set(folder, group)
  }

  await Promise.all([...grouped.entries()].map(async ([folder, groupItems]) => {
    const thumbsById = await loadMediaThumbUrls(
      mediaPath,
      folder,
      groupItems.map((item) => item.id),
    )

    // Assign constructed URLs first so cards can paint hits immediately.
    for (const item of groupItems) {
      item.thumb = thumbsById[item.id] || null
    }

    const missing = groupItems.filter((item) => {
      if (isEmptyMediaSource(item)) {
        item.thumb = IMAGE_UNAVAILABLE_URL
        return false
      }
      return Boolean(item.thumb)
    })

    // Probe constructed URLs — lite import leaves paths that 404.
    await mapWithConcurrency(missing, PROBE_CONCURRENCY, async (item) => {
      const url = item.thumb
      if (!url || isThumbUnavailable(url)) {
        item.thumb = null
        return
      }
      const exists = await probeDisplayImageUrl(url)
      if (!exists) item.thumb = null
    })

    const toCreate = groupItems.filter((item) => !item.thumb && !isEmptyMediaSource(item))
    if (toCreate.length) {
      await mapWithConcurrency(toCreate, CREATE_CONCURRENCY, async (item) => {
        const created = await ensureHomeItemThumb(item, mediaTypes, mediaPath, folder)
        item.thumb = created || IMAGE_UNAVAILABLE_URL
      })
    }

    for (const item of groupItems) {
      if (!item.thumb) item.thumb = IMAGE_UNAVAILABLE_URL
    }
  }))
}
