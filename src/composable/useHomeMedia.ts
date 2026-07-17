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

  return {
    continueWatching,
    favorites,
    topViews,
    isLoading,
    loadHomeMedia,
  }
}
