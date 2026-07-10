import { typedApi } from '@/services/typedApi'
import type { Tag } from '@/types/stores'

const cache = new Map<string, Tag>()

export function getTagHoverCacheKey(metaId: number, tagId: number): string {
  return `${metaId}:${tagId}`
}

export function getCachedTagForHover(metaId: number, tagId: number): Tag | undefined {
  return cache.get(getTagHoverCacheKey(metaId, tagId))
}

export async function loadTagForHover(metaId: number, tagId: number): Promise<Tag | null> {
  const key = getTagHoverCacheKey(metaId, tagId)
  const cached = cache.get(key)
  if (cached) return cached

  try {
    const res = await typedApi.postTagItems({
      metaId,
      filters: [],
      sortBy: 'name',
      sortDir: 'asc',
      ids: [tagId],
    })
    const tag = res.data.items[0]
    if (tag) {
      cache.set(key, tag)
      return tag
    }
  } catch (error) {
    console.error(error)
  }

  return null
}

export function invalidateTagHoverCache(metaId?: number, tagId?: number): void {
  if (metaId != null && tagId != null) {
    cache.delete(getTagHoverCacheKey(metaId, tagId))
    return
  }

  cache.clear()
}
