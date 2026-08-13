import { ref } from 'vue'
import { typedApi } from '@/services/typedApi'
import { useAppStore } from '@/stores/app'
import { loadHomeMediaThumbs } from '@/utils/homeMediaThumbs'
import type { HomeWidgetLimits } from '@/types/widgets'
import type { MediaItem } from '@/types/stores'

export interface HomeMediaLoadOptions {
  limits: HomeWidgetLimits
  loadContinue: boolean
  loadFavorites: boolean
  loadTopViews: boolean
}

const continueWatching = ref<MediaItem[]>([])
const favorites = ref<MediaItem[]>([])
const topViews = ref<MediaItem[]>([])
const isLoading = ref(false)

let loadPromise: Promise<void> | null = null
let lastOptionsKey = ''

function buildOptionsKey(options: HomeMediaLoadOptions, dbPath: string) {
  return [
    dbPath,
    options.loadContinue ? options.limits.continue ?? 12 : 0,
    options.loadFavorites ? options.limits.favorites ?? 12 : 0,
    options.loadTopViews ? options.limits.topViews ?? 12 : 0,
  ].join(':')
}

export function invalidateHomeMediaCache() {
  continueWatching.value = []
  favorites.value = []
  topViews.value = []
  isLoading.value = false
  loadPromise = null
  lastOptionsKey = ''
}

export function useHomeMedia() {
  const store = useAppStore()
  const favoritesLoading = ref(false)

  async function loadHomeMedia(options: HomeMediaLoadOptions) {
    const {
      limits,
      loadContinue,
      loadFavorites,
      loadTopViews,
    } = options

    if (!loadContinue && !loadFavorites && !loadTopViews) {
      continueWatching.value = []
      favorites.value = []
      topViews.value = []
      isLoading.value = false
      return
    }

    const optionsKey = buildOptionsKey(options, store.dbPath || '')
    if (loadPromise && optionsKey === lastOptionsKey) {
      return loadPromise
    }

    lastOptionsKey = optionsKey
    isLoading.value = true
    loadPromise = (async () => {
      try {
        const response = await typedApi.getHomeMedia({
          continueLimit: loadContinue ? (limits.continue ?? 12) : 0,
          favoritesLimit: loadFavorites ? (limits.favorites ?? 12) : 0,
          topViewsLimit: loadTopViews ? (limits.topViews ?? 12) : 0,
        })
        const data = response.data

        continueWatching.value = loadContinue ? (data.continueWatching || []) : []
        favorites.value = loadFavorites ? (data.favorites || []) : []
        topViews.value = loadTopViews ? (data.topViews || []) : []

        const allItems = [
          ...continueWatching.value,
          ...favorites.value,
          ...topViews.value,
        ]

        await loadHomeMediaThumbs(allItems, store.mediaTypes, store.mediaPath)
      } catch (error) {
        loadPromise = null
        lastOptionsKey = ''
        console.error(error)
        throw error
      } finally {
        isLoading.value = false
      }
    })()

    return loadPromise
  }

  /** Re-sample favorites from the API (random pivot) without touching other rows. */
  async function reshuffleFavorites(limit = 12) {
    favoritesLoading.value = true
    try {
      const response = await typedApi.getHomeMedia({
        continueLimit: 0,
        favoritesLimit: Math.min(Math.max(Number(limit) || 12, 1), 24),
        topViewsLimit: 0,
      })
      const next = response.data.favorites || []
      await loadHomeMediaThumbs(next, store.mediaTypes, store.mediaPath)
      favorites.value = next
    } catch (error) {
      console.error(error)
      throw error
    } finally {
      favoritesLoading.value = false
    }
  }

  return {
    continueWatching,
    favorites,
    topViews,
    isLoading,
    favoritesLoading,
    loadHomeMedia,
    reshuffleFavorites,
  }
}
