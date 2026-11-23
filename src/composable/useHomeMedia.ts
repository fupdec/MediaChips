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
  loadInbox?: boolean
}

const continueWatching = ref<MediaItem[]>([])
const favorites = ref<MediaItem[]>([])
const topViews = ref<MediaItem[]>([])
const inbox = ref<MediaItem[]>([])
const isLoading = ref(false)

let loadPromise: Promise<void> | null = null
let lastOptionsKey = ''
let loadGeneration = 0
let favoritesGeneration = 0

function buildOptionsKey(options: HomeMediaLoadOptions, dbPath: string) {
  return [
    dbPath,
    options.loadContinue ? options.limits.continue ?? 12 : 0,
    options.loadFavorites ? options.limits.favorites ?? 12 : 0,
    options.loadTopViews ? options.limits.topViews ?? 12 : 0,
    options.loadInbox ? options.limits.inbox ?? 12 : 0,
  ].join(':')
}

/** Loaded card references, shared with quiet metadata synchronization. */
export function getLoadedHomeMedia(): MediaItem[] {
  return [...continueWatching.value, ...favorites.value, ...topViews.value, ...inbox.value]
}

export function invalidateHomeMediaCache() {
  loadGeneration += 1
  favoritesGeneration += 1
  continueWatching.value = []
  favorites.value = []
  topViews.value = []
  inbox.value = []
  isLoading.value = false
  loadPromise = null
  lastOptionsKey = ''
}

export function useHomeMedia() {
  const store = useAppStore()
  const favoritesLoading = ref(false)
  let shuffleGeneration = 0

  async function loadHomeMedia(options: HomeMediaLoadOptions) {
    const {
      limits,
      loadContinue,
      loadFavorites,
      loadTopViews,
      loadInbox = false,
    } = options

    if (!loadContinue && !loadFavorites && !loadTopViews && !loadInbox) {
      invalidateHomeMediaCache()
      return
    }

    const optionsKey = buildOptionsKey(options, store.dbPath || '')
    if (loadPromise && optionsKey === lastOptionsKey) {
      return loadPromise
    }

    const generation = ++loadGeneration
    const favoritesRequestGeneration = ++favoritesGeneration
    const dbPath = store.dbPath
    const mediaTypes = store.mediaTypes
    const mediaPath = store.mediaPath
    const isCurrent = () => generation === loadGeneration && dbPath === store.dbPath
    lastOptionsKey = optionsKey
    isLoading.value = true
    loadPromise = (async () => {
      try {
        const response = await typedApi.getHomeMedia({
          continueLimit: loadContinue ? (limits.continue ?? 12) : 0,
          favoritesLimit: loadFavorites ? (limits.favorites ?? 12) : 0,
          topViewsLimit: loadTopViews ? (limits.topViews ?? 12) : 0,
          inboxLimit: loadInbox ? (limits.inbox ?? 12) : 0,
        })
        if (!isCurrent()) return
        const data = response.data

        continueWatching.value = loadContinue ? (data.continueWatching || []) : []
        if (favoritesRequestGeneration === favoritesGeneration) {
          favorites.value = loadFavorites ? (data.favorites || []) : []
        }
        topViews.value = loadTopViews ? (data.topViews || []) : []
        inbox.value = loadInbox ? (data.inbox || []) : []

        const allItems = [
          ...continueWatching.value,
          ...favorites.value,
          ...topViews.value,
          ...inbox.value,
        ]

        await loadHomeMediaThumbs(allItems, mediaTypes, mediaPath)
      } catch (error) {
        if (!isCurrent()) return
        loadPromise = null
        lastOptionsKey = ''
        console.error(error)
        throw error
      } finally {
        if (generation === loadGeneration) isLoading.value = false
      }
    })()

    return loadPromise
  }

  /** Re-sample favorites from the API (random pivot) without touching other rows. */
  async function reshuffleFavorites(limit = 12) {
    const shuffle = ++shuffleGeneration
    const generation = ++favoritesGeneration
    const dbPath = store.dbPath
    const mediaTypes = store.mediaTypes
    const mediaPath = store.mediaPath
    const isCurrent = () => generation === favoritesGeneration && dbPath === store.dbPath
    favoritesLoading.value = true
    try {
      const response = await typedApi.getHomeMedia({
        continueLimit: 0,
        favoritesLimit: Math.min(Math.max(Number(limit) || 12, 1), 24),
        topViewsLimit: 0,
      })
      if (!isCurrent()) return
      const next = response.data.favorites || []
      await loadHomeMediaThumbs(next, mediaTypes, mediaPath)
      if (isCurrent()) favorites.value = next
    } catch (error) {
      if (!isCurrent()) return
      console.error(error)
      throw error
    } finally {
      if (shuffle === shuffleGeneration) favoritesLoading.value = false
    }
  }

  return {
    continueWatching,
    favorites,
    topViews,
    inbox,
    isLoading,
    favoritesLoading,
    loadHomeMedia,
    reshuffleFavorites,
  }
}
