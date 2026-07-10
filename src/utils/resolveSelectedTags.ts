import { useAppStore } from '@/stores/app'
import { useItemsStore } from '@/stores/items'
import type { Tag } from '@/types/stores'

export function resolveSelectedTags(ids: number[] = []): Tag[] {
  const appStore = useAppStore()
  const itemsStore = useItemsStore()
  const tagsById = new Map<number, Tag>()

  for (const tag of appStore.tags || []) {
    tagsById.set(tag.id, tag)
  }

  for (const item of itemsStore.entities) {
    if (!tagsById.has(item.id)) {
      tagsById.set(item.id, item as Tag)
    }
  }

  return ids
    .map((id) => tagsById.get(id))
    .filter((tag): tag is Tag => Boolean(tag))
}

export function getAllTagsForMeta(metaId: number): Tag[] {
  const appStore = useAppStore()
  return (appStore.tags || []).filter((tag) => tag.metaId === metaId)
}
