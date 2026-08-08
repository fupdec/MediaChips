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
import { mapWithConcurrency } from '@/utils/mapWithConcurrency'
import { warmDisplayImageUrl } from '@/utils/probeImageUrl'
import { galleryPerfCounters } from '@/utils/galleryPerfCounters'
import { isThumbUnavailable } from '@/utils/thumbSource'
import { enqueueEnsureImageDimensions } from '@/utils/imageDimensionsEnsure'
import { isImageMediaType } from '@/utils/mediaType'
import type { MediaType } from '@/types/media'
import type { MediaItem, Tag } from '@/types/stores'

/** Cap how many missing-dimension probes we start per prefetch pass. */
const DIMENSION_ENSURE_MAX = 8

const PREFETCH_FALLBACK_LIMIT = 24
const PREFETCH_AHEAD_LIMIT = 12
/** Cap decode-warms so scroll prefetch does not starve visible card loads. */
const PREFETCH_WARM_CONCURRENCY = 4
const PREFETCH_WARM_MAX = 16
const PREFETCH_WARM_BUSY_THRESHOLD = 8

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
    const visibleItems = items.filter((item) => visibleSet.has(Number(item.id)))
    if (!visibleItems.length) return []

    // Include a small ahead window after the last visible item in list order.
    const lastVisibleIndex = items.reduce((maxIndex, item, index) => (
      visibleSet.has(Number(item.id)) ? index : maxIndex
    ), -1)
    const ahead = lastVisibleIndex >= 0
      ? items.slice(lastVisibleIndex + 1, lastVisibleIndex + 1 + PREFETCH_AHEAD_LIMIT)
      : []

    const merged = new Map<number, T>()
    for (const item of [...visibleItems, ...ahead]) {
      merged.set(Number(item.id), item)
    }
    return [...merged.values()]
  }

  // Avoid warming the wrong window while IO visibility is still settling.
  if (items.length <= PREFETCH_FALLBACK_LIMIT) return items
  return items.slice(0, PREFETCH_FALLBACK_LIMIT)
}

async function warmPrefetchUrls(urls: string[]): Promise<void> {
  if (galleryPerfCounters.thumbInFlight >= PREFETCH_WARM_BUSY_THRESHOLD) return

  const unique = [...new Set(
    urls.filter((url) => url && !isThumbUnavailable(url)),
  )].slice(0, PREFETCH_WARM_MAX)

  if (!unique.length) return

  await mapWithConcurrency(unique, PREFETCH_WARM_CONCURRENCY, async (url) => {
    galleryPerfCounters.thumbInFlight += 1
    try {
      await warmDisplayImageUrl(url)
    } finally {
      galleryPerfCounters.thumbInFlight = Math.max(0, galleryPerfCounters.thumbInFlight - 1)
    }
  })
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

      if (isImageMediaType(mediaType.value)) {
        const missingDims = list
          .filter((item) => {
            const width = Number((item as MediaItem).width) || 0
            const height = Number((item as MediaItem).height) || 0
            return width <= 0 || height <= 0
          })
          .slice(0, DIMENSION_ENSURE_MAX)
        for (const item of missingDims) {
          void enqueueEnsureImageDimensions(Number(item.id))
        }
      }

      const thumbs = await loadMediaThumbUrls(
        appStore.mediaPath,
        folder,
        list.map((item) => item.id),
      )
      setCachedMediaThumbs(folder, thumbs)
      void warmPrefetchUrls(Object.values(thumbs))
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

      const warmUrls: string[] = []
      for (const byType of Object.values(thumbs)) {
        if (!byType || typeof byType !== 'object') continue
        const preferred = Number(itemsStore.view) === 2
          ? (byType.avatar || byType.main)
          : (byType.main || byType.avatar)
        if (typeof preferred === 'string') warmUrls.push(preferred)
      }
      void warmPrefetchUrls(warmUrls)
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
