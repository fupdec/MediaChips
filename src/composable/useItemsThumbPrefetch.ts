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
import type { MediaType } from '@/types/media'
import type { MediaItem, Tag } from '@/types/stores'

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

export function useItemsThumbPrefetch({
  items,
  itemsType,
  mediaType,
  metaId,
}: UseItemsThumbPrefetchOptions) {
  const appStore = useAppStore()
  const itemsStore = useItemsStore()

  const prefetch = async () => {
    const list = items.value
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
      for (const tagId of Object.keys(thumbs)) {
        itemsStore.refreshThumb(Number(tagId), {broadcast: false})
      }
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
    ],
    () => debouncedPrefetch(),
    { immediate: true },
  )
}
