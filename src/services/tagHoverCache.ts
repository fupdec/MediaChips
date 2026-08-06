import { typedApi } from '@/services/typedApi'
import type { AssignedMeta, Tag } from '@/types/stores'

const cache = new Map<string, Tag>()
const pinnedChildCache = new Map<number, AssignedMeta[]>()

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

export function getCachedPinnedChildMetaForHover(metaId: number): AssignedMeta[] | undefined {
  return pinnedChildCache.get(metaId)
}

export async function loadPinnedChildMetaForHover(metaId: number): Promise<AssignedMeta[]> {
  const cached = pinnedChildCache.get(metaId)
  if (cached) return cached

  try {
    const res = await typedApi.getPinnedChildMeta(metaId)
    const rows = res.data || []
    pinnedChildCache.set(metaId, rows)
    return rows
  } catch (error) {
    console.error(error)
  }

  return []
}

/** Whether hover card should render the pinned-meta section. */
export function hasVisibleTagHoverPinnedMeta(
  tag: Pick<Tag, 'tags' | 'values'> | null | undefined,
  assignment: AssignedMeta[] | null | undefined,
): boolean {
  const shownIds = new Set(
    (assignment || [])
      .filter((row) => row.show === true || row.show === 1)
      .map((row) => Number(row.pinnedMetaId))
      .filter((id) => Number.isFinite(id)),
  )
  if (!shownIds.size) return false

  if (tag?.tags?.some((entry) => entry && shownIds.has(Number(entry.metaId)))) {
    return true
  }

  return Boolean(
    tag?.values?.some((entry) => (
      entry
      && entry.value != null
      && entry.value !== ''
      && shownIds.has(Number(entry.metaId))
    )),
  )
}

export function invalidateTagHoverCache(metaId?: number, tagId?: number): void {
  if (metaId != null && tagId != null) {
    cache.delete(getTagHoverCacheKey(metaId, tagId))
    return
  }

  if (metaId != null) {
    pinnedChildCache.delete(metaId)
    for (const key of cache.keys()) {
      if (key.startsWith(`${metaId}:`)) cache.delete(key)
    }
    return
  }

  cache.clear()
  pinnedChildCache.clear()
}
