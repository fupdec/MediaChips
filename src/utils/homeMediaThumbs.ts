import { getMediaDeleteAssetFolder } from '@/utils/mediaType'
import { loadMediaThumbUrls } from '@/utils/mediaThumbLoader'
import { IMAGE_UNAVAILABLE_URL } from '@/utils/imageSource'
import type { MediaType } from '@/types/media'

interface HomeMediaItem {
  id: number
  mediaTypeId?: number
  thumb?: string | null
}

function getThumbMediaType(mediaTypes: MediaType[], mediaTypeId: number | undefined): string {
  const mediaType = mediaTypes.find((item) => item.id === Number(mediaTypeId))
  return getMediaDeleteAssetFolder(mediaType) || 'videos'
}

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

    for (const item of groupItems) {
      item.thumb = thumbsById[item.id] ?? IMAGE_UNAVAILABLE_URL
    }
  }))
}
