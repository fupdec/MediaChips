import {typedApi} from '@/services/typedApi'
import { useItemsStore } from '@/stores/items'
import type { MediaItem } from '@/types/stores'

export async function resolveSelectedMediaItems(ids: number[] = []): Promise<MediaItem[]> {
  const itemsStore = useItemsStore()
  const itemsById = new Map(itemsStore.entities.map((entry) => [entry.id, entry]))
  const selectedIds = [...new Set(ids)]
  const missingIds = selectedIds.filter((id) => !itemsById.has(id))

  // Keep requests bounded even when select-all spans a large library.
  for (let offset = 0; offset < missingIds.length; offset += 500) {
    const response = await typedApi.getMediaBasics({ids: missingIds.slice(offset, offset + 500)})
    for (const entry of response.data.items || []) {
      itemsById.set(entry.id, entry)
    }
  }

  return selectedIds.map((id) => itemsById.get(id)).filter((item): item is MediaItem => Boolean(item))
}

export function shouldReloadListAfterBulkAction(selectedIds: number[] = []): boolean {
  const itemsStore = useItemsStore()

  if (!selectedIds.length) return false

  const loadedIds = new Set(itemsStore.entities.map((entry) => entry.id))
  return selectedIds.length > itemsStore.itemsOnPage.length
    || selectedIds.some((id) => !loadedIds.has(id))
}
