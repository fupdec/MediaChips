import { watch, type ComputedRef, type Ref } from 'vue'
import { debounce } from '@/utils/debounce'
import { useAppStore } from '@/stores/app'
import { useItemsStore } from '@/stores/items'
import { getMediaDeleteAssetFolder } from '@/utils/mediaType'
import { loadMediaThumbUrls } from '@/utils/mediaThumbLoader'
import { loadTagThumbUrls } from '@/utils/tagThumbLoader'
import {
  setCachedMediaThumbs,
  setCachedTagThumbs,
} from '@/utils/thumbDisplayCache'
import { visibleItemIds } from '@/utils/visibleItemsWindow'
import type { MediaType } from '@/types/media'
import type { MediaItem, Tag } from '@/types/stores'

const PREFETCH_FALLBACK_LIMIT = 48

interface UseItemsThumbPrefetchOptions {
  items: ComputedRef<Array<MediaItem | Tag>>
  itemsType: ComputedRef<'media' | 'tag'>
  mediaType: Ref<MediaType | null>
  metaId?: ComputedRef<number | undefined>
}

function getItemsSignature(items: Array<MediaItem | Tag>): string {
  if (!items.length) return '0'
  const firstId = items[0]?.id ?? ''
  const lastId = items[items.length - 1]?.id ?? ''
  return `${items.length}:${firstId}:${lastId}`
}

function resolvePrefetchItems<T extends { id: number | string }>(items: T[]): T[] {
  const visible = visibleItemIds.value
  if (visible.length) {
    const visibleSet = new Set(visible.map((id) => Number(id)))
    return items.filter((item) => visibleSet.has(Number(item.id)))
  }

  if (items.length <= PREFETCH_FALLBACK_LIMIT) return items
  return items.slice(0, PREFETCH_FALLBACK_LIMIT)
}

export function useItemsThumbPrefetch({
  items,
  itemsType,
  mediaType,
  metaId,
}: UseItemsThumbPrefetchOptions) {
  const appStore = useAppStore()
  const itemsStore = useItemsStore()

  const prefetch = async () => {
    const list = resolvePrefetchItems(items.value)
    if (!list.length) return

    if (itemsType.value === 'media' && mediaType.value) {
      const folder = getMediaDeleteAssetFolder(mediaType.value)
      if (!folder || !appStore.mediaPath) return

      const thumbs = await loadMediaThumbUrls(
        appStore.mediaPath,
        folder,
        list.map((item) => item.id),
      )
      setCachedMediaThumbs(folder, thumbs)
      return
    }

    if (itemsType.value === 'tag' && metaId?.value && appStore.dbPath) {
      const types = Number(itemsStore.view) === 2
        ? ['avatar', 'main']
        : ['main', 'alt', 'custom1', 'custom2']

      const thumbs = await loadTagThumbUrls(
        appStore.dbPath,
        metaId.value,
        list.map((item) => item.id),
        types,
      )
      setCachedTagThumbs(metaId.value, thumbs)
    }
  }

  const debouncedPrefetch = debounce(() => {
    void prefetch()
  }, 40, { leading: true, trailing: false })

  watch(
    () => [
      itemsType.value,
      mediaType.value?.id ?? null,
      metaId?.value ?? null,
      Number(itemsStore.view),
      getItemsSignature(items.value),
      visibleItemIds.value.join(','),
    ],
    () => debouncedPrefetch(),
    { immediate: true },
  )
}
