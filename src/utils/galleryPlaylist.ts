import {typedApi} from '@/services/typedApi'
import {cloneFilters} from '@/utils/filterClone'
import {mapWithConcurrency} from '@/utils/mapWithConcurrency'
import {orderItemsByIds} from '@/utils/orderItemsByIds'
import {orderRowsByIds} from '@shared/listPagination'
import type {FilterObject} from '@/types/common'
import type {MediaItem} from '@/types/stores'

/** SQLite IN (:ids) stays well under the variable-number cap. */
export const MEDIA_BASICS_CHUNK = 400

export type GalleryPlaylistContext = {
  type: string
  mediaTypeId?: number | null
  filters?: FilterObject[]
  filtersJoin?: 'and' | 'or'
  sortBy?: string
  sortDir?: string
  find_duplicates?: boolean
  duplicatesBy?: string | null
  listScopeIds?: number[] | null
  entities?: MediaItem[]
  navigationItems?: MediaItem[]
  totalFiltered?: number
}

export function mergeLoadedPlaylistItems<T extends {id?: unknown}>(
  ordered: T[],
  loaded: T[] = [],
): T[] {
  if (!ordered.length) return []
  if (!loaded.length) return ordered

  const byId = new Map<number, T>()
  for (const item of loaded) {
    const id = Number(item.id)
    if (!Number.isFinite(id) || id <= 0) continue
    byId.set(id, item)
  }
  if (!byId.size) return ordered

  return ordered.map((item) => {
    const rich = byId.get(Number(item.id))
    return rich ?? item
  })
}

export function scopedPlaylistIds(listScopeIds: unknown): number[] {
  if (!Array.isArray(listScopeIds) || !listScopeIds.length) return []
  const ids: number[] = []
  const seen = new Set<number>()
  for (const value of listScopeIds) {
    const id = Number(value)
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

export function keepPlaylistItemsForMediaType<T extends {mediaTypeId?: unknown}>(
  items: T[],
  mediaTypeId: unknown,
): T[] {
  const typeId = Number(mediaTypeId)
  if (!Number.isFinite(typeId) || typeId <= 0 || !items.length) return items
  const matched = items.filter((item) => {
    if (item.mediaTypeId == null || item.mediaTypeId === '') return true
    return Number(item.mediaTypeId) === typeId
  })
  return matched.length ? matched : items
}

export async function fetchMediaBasicsByIds(ids: number[]): Promise<MediaItem[]> {
  if (!ids.length) return []

  const chunks: number[][] = []
  for (let i = 0; i < ids.length; i += MEDIA_BASICS_CHUNK) {
    chunks.push(ids.slice(i, i + MEDIA_BASICS_CHUNK))
  }

  const parts = await mapWithConcurrency(chunks, 3, async (chunk) => {
    const res = await typedApi.getMediaBasics({ids: chunk})
    return (Array.isArray(res.data?.items) ? res.data.items : []) as MediaItem[]
  })

  return orderRowsByIds(parts.flat(), ids)
}

function listIdsFromRows(rows: Array<{id?: unknown}> | undefined): number[] {
  if (!Array.isArray(rows) || !rows.length) return []
  return scopedPlaylistIds(rows.map((row) => row.id))
}

/**
 * Build the player queue from the current video gallery list.
 * Infinite scroll only keeps a page of cards in memory, so Play asks the
 * filtered-id endpoint for the full ordered set instead of that window.
 */
export async function resolveGalleryPlaylistVideos(
  ctx: GalleryPlaylistContext,
): Promise<MediaItem[] | null> {
  if (ctx.type === 'tag') return null

  const loaded = Array.isArray(ctx.entities) ? ctx.entities : []
  const cachedNav = Array.isArray(ctx.navigationItems) ? ctx.navigationItems : []
  const scopedIds = scopedPlaylistIds(ctx.listScopeIds)
  const mediaTypeId = ctx.mediaTypeId

  const finish = (items: MediaItem[] | null | undefined) => {
    if (!items?.length) return null
    return keepPlaylistItemsForMediaType(
      mergeLoadedPlaylistItems(items, loaded),
      mediaTypeId,
    )
  }

  try {
    if (scopedIds.length) {
      if (cachedNav.length >= scopedIds.length) {
        return finish(orderItemsByIds(cachedNav, scopedIds))
      }
      if (loaded.length >= scopedIds.length) {
        return finish(orderItemsByIds(loaded, scopedIds))
      }
      const slim = await fetchMediaBasicsByIds(scopedIds)
      return finish(slim)
    }

    const idsPayload = {
      mediaTypeId,
      filters: cloneFilters(ctx.filters),
      filtersJoin: ctx.filtersJoin === 'or' ? 'or' : 'and' as const,
      sortBy: ctx.sortBy || 'id',
      direction: ctx.sortDir || 'desc',
      find_duplicates: Boolean(ctx.find_duplicates),
      duplicates_by: ctx.duplicatesBy,
      skipTotals: true,
    }

    let navigation: MediaItem[] = []
    let ids: number[] = []
    try {
      const idsRes = await typedApi.getMediaIds({
        ...idsPayload,
        includeNavigation: true,
      })
      navigation = Array.isArray(idsRes.data?.navigation)
        ? idsRes.data.navigation as MediaItem[]
        : []
      ids = scopedPlaylistIds(idsRes.data?.ids).length
        ? scopedPlaylistIds(idsRes.data?.ids)
        : listIdsFromRows(navigation)
    } catch (error) {
      console.warn('Failed to load gallery playlist navigation:', error)
    }

    if (navigation.length) {
      return finish(ids.length ? orderItemsByIds(navigation, ids) : navigation)
    }

    if (!ids.length) {
      const idsRes = await typedApi.getMediaIds({
        ...idsPayload,
        includeNavigation: false,
      })
      ids = scopedPlaylistIds(idsRes.data?.ids)
    }

    if (!ids.length) return null

    if (cachedNav.length >= ids.length) {
      return finish(orderItemsByIds(cachedNav, ids))
    }

    if (loaded.length >= ids.length) {
      return finish(orderItemsByIds(loaded, ids))
    }

    return finish(await fetchMediaBasicsByIds(ids))
  } catch (error) {
    console.warn('Failed to load full gallery playlist:', error)
    return null
  }
}
