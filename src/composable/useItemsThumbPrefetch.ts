import { watch, type ComputedRef, type Ref } from 'vue'
import { debounce } from '@/utils/debounce'
import { useAppStore } from '@/stores/app'
import { useItemsStore } from '@/stores/items'
import { useSettingsStore } from '@/stores/settings'
import { isImageMediaType, getMediaDeleteAssetFolder } from '@/utils/mediaType'
import { loadMediaThumbUrls } from '@/utils/mediaThumbLoader'
import { loadTagThumbUrls } from '@/utils/tagThumbLoader'
import {
  getCachedThumb,
  mediaThumbKey,
  setCachedMediaThumbs,
  setCachedTagThumbs,
} from '@/utils/thumbDisplayCache'
import { CARD_THUMB_MAX_EDGE } from '@/utils/thumbSource'
import { visibleItemIds } from '@/utils/visibleItemsWindow'
import { enqueueEnsureImageDimensions } from '@/utils/imageDimensionsEnsure'
import { warmDisplayImageUrl } from '@/utils/probeImageUrl'
import { mapWithConcurrency } from '@/utils/mapWithConcurrency'
import type { MediaType } from '@/types/media'
import type { MediaItem, Tag } from '@/types/stores'

/** Cap how many missing-dimension probes we start per prefetch pass. */
const DIMENSION_ENSURE_MAX = 8

const PREFETCH_FALLBACK_LIMIT = 80
const PREFETCH_AHEAD_LIMIT = 64
const PREFETCH_BEHIND_LIMIT = 16
/** HTTP-warm only the nearest cards so decode work stays bounded. */
const WARM_AHEAD_LIMIT = 24
const WARM_CONCURRENCY = 8

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
  if (!items.length) return []

  const visible = visibleItemIds.value
  if (visible.length) {
    const visibleSet = new Set(visible.map((id) => Number(id)))
    const visibleIndexes: number[] = []
    for (let index = 0; index < items.length; index += 1) {
      if (visibleSet.has(Number(items[index].id))) visibleIndexes.push(index)
    }
    if (visibleIndexes.length) {
      const firstVisible = visibleIndexes[0]
      const lastVisible = visibleIndexes[visibleIndexes.length - 1]
      const from = Math.max(0, firstVisible - PREFETCH_BEHIND_LIMIT)
      const to = Math.min(items.length, lastVisible + 1 + PREFETCH_AHEAD_LIMIT)
      return items.slice(from, to)
    }
  }

  // After scrollbar jumps, IO visibility can lag — warm the loaded window head.
  if (items.length <= PREFETCH_FALLBACK_LIMIT) return items
  return items.slice(0, PREFETCH_FALLBACK_LIMIT)
}

function isCardThumbCached(
  folder: string,
  id: number | string,
  subfolder: 'thumbs' | 'grids',
): boolean {
  const key = folder === 'videos'
    ? mediaThumbKey(folder, id, subfolder)
    : mediaThumbKey(folder, id)
  const cached = getCachedThumb(key)
  if (!cached) return false
  const hasMaxEdge = String(cached).includes('maxEdge=')
  // Timeline/grid sprites need the full sheet; maxEdge entries are unusable.
  return subfolder === 'grids' ? !hasMaxEdge : hasMaxEdge
}

export function useItemsThumbPrefetch({
  items,
  itemsType,
  mediaType,
  metaId,
}: UseItemsThumbPrefetchOptions) {
  const appStore = useAppStore()
  const itemsStore = useItemsStore()
  const settingsStore = useSettingsStore()
  let warmAbort: AbortController | null = null
  let warmTimer: ReturnType<typeof setTimeout> | null = null
  let lastPrefetchFirstId: number | string | null = null

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

      const isTimelineView = Number(itemsStore.view) === 2
      const subfolder = folder === 'videos'
        && (isTimelineView || settingsStore.videoPreviewStatic === 'grid')
        ? 'grids' as const
        : 'thumbs' as const

      const missing = list.filter((item) => !isCardThumbCached(folder, item.id, subfolder))
      const thumbs = missing.length
        ? await loadMediaThumbUrls(
          appStore.mediaPath,
          folder,
          missing.map((item) => item.id),
          {
            // Full sprites for timeline; downscaled thumbs for card grid.
            maxEdge: subfolder === 'grids' ? null : CARD_THUMB_MAX_EDGE,
            subfolder,
          },
        )
        : {}

      if (Object.keys(thumbs).length) {
        setCachedMediaThumbs(folder, thumbs, subfolder)
      }

      const firstId = list[0]?.id ?? null
      const jumpedWindow = lastPrefetchFirstId != null
        && firstId != null
        && firstId !== lastPrefetchFirstId
      lastPrefetchFirstId = firstId

      // Far scrollbar seeks already jank from remount — defer decode-warm.
      warmAbort?.abort()
      if (warmTimer) clearTimeout(warmTimer)
      warmAbort = new AbortController()
      const signal = warmAbort.signal
      const warmIds = list.slice(0, WARM_AHEAD_LIMIT).map((item) => item.id)
      const warmUrls = warmIds
        .map((id) => {
          const key = folder === 'videos'
            ? mediaThumbKey(folder, id, subfolder)
            : mediaThumbKey(folder, id)
          return getCachedThumb(key) || thumbs[id]
        })
        .filter((url): url is string => Boolean(url))

      const runWarm = () => {
        void mapWithConcurrency(warmUrls, WARM_CONCURRENCY, async (url) => {
          await warmDisplayImageUrl(url, signal)
        })
      }
      if (jumpedWindow) warmTimer = setTimeout(runWarm, 350)
      else runWarm()
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

  // Leading for immediate paint; trailing so the final scroll window is not dropped.
  const debouncedPrefetch = debounce(() => {
    void prefetch()
  }, 20, { leading: true, trailing: true })

  watch(
    () => [
      itemsType.value,
      mediaType.value?.id ?? null,
      metaId?.value ?? null,
      Number(itemsStore.view),
      settingsStore.videoPreviewStatic,
      getItemsSignature(items.value),
      visibleItemIds.value.join(','),
    ],
    () => debouncedPrefetch(),
    { immediate: true },
  )
}
