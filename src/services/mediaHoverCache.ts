import { typedApi } from '@/services/typedApi'
import { useItemsStore } from '@/stores/items'
import type { MediaItem } from '@/types/stores'

const MAX_HOVER_CACHE = 80
const cache = new Map<string, MediaItem>()

export function getMediaHoverCacheKey(mediaTypeId: number, mediaId: number): string {
  return `${mediaTypeId}:${mediaId}`
}

function touch(key: string, item: MediaItem): void {
  cache.delete(key)
  cache.set(key, item)
  while (cache.size > MAX_HOVER_CACHE) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

export function getCachedMediaForHover(mediaTypeId: number, mediaId: number): MediaItem | undefined {
  const key = getMediaHoverCacheKey(mediaTypeId, mediaId)
  const cached = cache.get(key)
  if (!cached) return undefined
  touch(key, cached)
  return cached
}

export async function loadMediaForHover(
  mediaTypeId: number,
  mediaId: number,
): Promise<MediaItem | null> {
  const key = getMediaHoverCacheKey(mediaTypeId, mediaId)
  const cached = cache.get(key)
  if (cached) {
    touch(key, cached)
    return cached
  }

  const itemsStore = useItemsStore()
  const fromStore = itemsStore.getItemById(mediaId)
  if (fromStore?.tags?.length || fromStore?.values?.length) {
    touch(key, fromStore)
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
      touch(key, item)
      return item
    }
  } catch (error) {
    console.error(error)
  }

  if (fromStore) {
    touch(key, fromStore)
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
