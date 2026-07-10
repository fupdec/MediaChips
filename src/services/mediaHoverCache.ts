import { typedApi } from '@/services/typedApi'
import { useItemsStore } from '@/stores/items'
import type { MediaItem } from '@/types/stores'

const cache = new Map<string, MediaItem>()

export function getMediaHoverCacheKey(mediaTypeId: number, mediaId: number): string {
  return `${mediaTypeId}:${mediaId}`
}

export function getCachedMediaForHover(mediaTypeId: number, mediaId: number): MediaItem | undefined {
  return cache.get(getMediaHoverCacheKey(mediaTypeId, mediaId))
}

export async function loadMediaForHover(
  mediaTypeId: number,
  mediaId: number,
): Promise<MediaItem | null> {
  const key = getMediaHoverCacheKey(mediaTypeId, mediaId)
  const cached = cache.get(key)
  if (cached) return cached

  const itemsStore = useItemsStore()
  const fromStore = itemsStore.getItemById(mediaId)
  if (fromStore?.tags?.length || fromStore?.values?.length) {
    cache.set(key, fromStore)
    return fromStore
  }

  try {
    const res = await typedApi.getMediaItems({
      mediaTypeId,
      filters: [],
      ids: [mediaId],
      limit: 1,
    })
    const item = res.data.items?.[0]
    if (item) {
      cache.set(key, item)
      return item
    }
  } catch (error) {
    console.error(error)
  }

  if (fromStore) {
    cache.set(key, fromStore)
    return fromStore
  }

  return null
}

export function invalidateMediaHoverCache(mediaTypeId?: number, mediaId?: number): void {
  if (mediaTypeId != null && mediaId != null) {
    cache.delete(getMediaHoverCacheKey(mediaTypeId, mediaId))
    return
  }

  cache.clear()
}
