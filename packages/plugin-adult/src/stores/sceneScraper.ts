import { defineStore } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useDialogsStore } from '@/stores/dialogs'
import { useTasksStore } from '@/stores/tasks'
import { useSettingsStore } from '@/stores/settings'
import { matchScraperScenes, searchScraperScenes, fetchSceneMarkers } from '../services/sceneScraperApi'
import {
  annotateSceneMarkersWithExisting,
} from '../services/sceneScraperMarkers'
import { typedApi } from '@/services/typedApi'
import {
  matchAndAutoApplySceneToMedia,
  type SceneAutoApplyResult,
} from '../services/sceneScraperAutoApply'
import { buildSceneSearchQueryFromFilename } from '@/utils/sceneSearchQuery'
import translate, { type Locale } from '@/utils/translate'
import { getCurrentMediaType, getMediaDeleteAssetFolder } from '@/utils/mediaType'
import type { SceneScraperScene, SceneScraperMarkerEntry } from '../types/sceneScraper'
import type { ScraperPinnedItem, ScraperTransferField } from '../types/scraper'
import type { MediaItem } from '@/types/stores'
import type { AutoScrapeBatchOutcome } from '../types/autoScrapeBatch'

export type SceneScraperMatchMethod = 'oshash' | 'search' | null
export type AutoSceneScrapeResult = SceneAutoApplyResult

export const useSceneScraperStore = defineStore('useSceneScraperStore', {
  state: () => ({
    query: '',
    scenes: [] as SceneScraperScene[],
    searchInProgress: false,
    searchRequestId: 0,
    lastError: null as string | null,
    matchMethod: null as SceneScraperMatchMethod,
    oshash: null as string | null,
    currentValues: {} as Record<string, unknown>,
    fields: [] as ScraperTransferField[],
    pinned: [] as ScraperPinnedItem[],
    transferMediaId: null as number | null,
    selectedPosterUrl: null as string | null,
    markers: [] as import('../types/sceneScraper').SceneScraperMarkerEntry[],
    markersLoading: false,
    markersSceneId: null as string | null,
    autoScrapeInProgress: false,
    autoScrapeCancelled: false,
    batchTaskId: null as string | null,
  }),
  actions: {
    setQueryFromFilename(filename: string) {
      this.query = buildSceneSearchQueryFromFilename(filename)
    },
    clearSearchResults() {
      this.scenes = []
      this.matchMethod = null
      this.oshash = null
      this.lastError = null
      this.fields = []
      this.selectedPosterUrl = null
      this.markers = []
      this.markersLoading = false
      this.markersSceneId = null
    },
    beginSearchRequest() {
      this.searchRequestId += 1
      this.searchInProgress = true
      this.clearSearchResults()
      return this.searchRequestId
    },
    isCurrentSearchRequest(requestId: number) {
      return this.searchRequestId === requestId
    },
    async matchScenesForMedia({
      mediaId,
      query,
      limit = 24,
    }: {
      mediaId: number
      query?: string
      limit?: number
    }) {
      const searchQuery = String(query ?? this.query).trim()
      this.query = searchQuery
      const requestId = this.beginSearchRequest()

      try {
        const result = await matchScraperScenes({
          mediaId,
          query: searchQuery || undefined,
          limit,
        })
        if (!this.isCurrentSearchRequest(requestId)) return this.scenes

        this.scenes = result.data || []
        this.matchMethod = result.matchMethod || null
        this.oshash = result.oshash || null
        return this.scenes
      } catch (error: unknown) {
        if (!this.isCurrentSearchRequest(requestId)) return this.scenes
        this.lastError = error instanceof Error ? error.message : String(error)
        this.scenes = []
        this.matchMethod = null
        this.oshash = null
        return []
      } finally {
        if (this.isCurrentSearchRequest(requestId)) {
          this.searchInProgress = false
        }
      }
    },
    async searchScenes({query, limit = 24}: {query?: string; limit?: number} = {}) {
      const searchQuery = String(query ?? this.query).trim()
      this.query = searchQuery
      const requestId = this.beginSearchRequest()

      try {
        if (!searchQuery) {
          if (!this.isCurrentSearchRequest(requestId)) return this.scenes
          this.scenes = []
          this.matchMethod = null
          return []
        }

        const result = await searchScraperScenes(searchQuery, {limit})
        if (!this.isCurrentSearchRequest(requestId)) return this.scenes

        this.scenes = result.data || []
        this.matchMethod = result.matchMethod || 'search'
        return this.scenes
      } catch (error: unknown) {
        if (!this.isCurrentSearchRequest(requestId)) return this.scenes
        this.lastError = error instanceof Error ? error.message : String(error)
        this.scenes = []
        this.matchMethod = null
        return []
      } finally {
        if (this.isCurrentSearchRequest(requestId)) {
          this.searchInProgress = false
        }
      }
    },
    reset() {
      this.query = ''
      this.scenes = []
      this.searchInProgress = false
      this.searchRequestId += 1
      this.lastError = null
      this.matchMethod = null
      this.oshash = null
      this.currentValues = {}
      this.fields = []
      this.pinned = []
      this.transferMediaId = null
      this.selectedPosterUrl = null
      this.markers = []
      this.markersLoading = false
      this.markersSceneId = null
    },
    async loadMarkersForScene({
      sceneId,
      mediaId,
    }: {
      sceneId: string
      mediaId: number
    }) {
      const normalizedSceneId = String(sceneId || '').trim()
      if (!normalizedSceneId || !mediaId) {
        this.markers = []
        this.markersSceneId = null
        return []
      }

      if (this.markersSceneId === normalizedSceneId && !this.markersLoading) {
        return this.markers
      }

      this.markersLoading = true
      this.markersSceneId = normalizedSceneId

      try {
        const appStore = useAppStore()
        const settingsStore = useSettingsStore()
        const markerMetaId = Number(settingsStore.sceneScraperMarkerMetaId) || null

        const [markersResponse, existingMarksResponse] = await Promise.all([
          fetchSceneMarkers(normalizedSceneId),
          typedApi.getMarksForVideo(mediaId),
        ])

        this.markers = annotateSceneMarkersWithExisting(
          markersResponse.data || [],
          existingMarksResponse.data || [],
          {
            allTags: appStore.tags || [],
            markerMetaId,
          },
        )
        return this.markers
      } catch (error) {
        console.error('Failed to load scene markers:', error)
        this.markers = []
        return []
      } finally {
        this.markersLoading = false
      }
    },
    setMarkers(markers: SceneScraperMarkerEntry[]) {
      this.markers = markers
    },
    cancelAutoScrape() {
      this.autoScrapeCancelled = true
    },
    clearBatchTask() {
      if (!this.batchTaskId) return
      useTasksStore().removeTask(this.batchTaskId)
      this.batchTaskId = null
    },
    async autoScrapeMedia({
      media,
      requireExactOshash = true,
    }: {
      media: MediaItem
      requireExactOshash?: boolean
    }): Promise<AutoSceneScrapeResult> {
      const appStore = useAppStore()
      const mediaType = getCurrentMediaType(appStore.mediaTypes, media.mediaTypeId)
      const mediaTypeFolder = getMediaDeleteAssetFolder(mediaType) || 'videos'

      // Use the live store list (not a snapshot). findOrCreateTagByName pushes
      // newly created performers/tags onto this array so later media in a batch
      // reuse them instead of inserting duplicates.
      return matchAndAutoApplySceneToMedia({
        media,
        allTags: appStore.tags || [],
        mediaPath: appStore.mediaPath,
        mediaTypeFolder,
        requireExactOshash,
      })
    },
    async autoScrapeMediaItems({
      mediaItems,
      requireExactOshash = true,
    }: {
      mediaItems: MediaItem[]
      requireExactOshash?: boolean
    }): Promise<AutoScrapeBatchOutcome<AutoSceneScrapeResult>> {
      const dialogsStore = useDialogsStore()
      const tasksStore = useTasksStore()
      const settingsStore = useSettingsStore()
      const locale = settingsStore.locale as Locale
      const t = (key: string, params: Record<string, string | number> = {}) =>
        translate(key, params, locale)

      const results: AutoSceneScrapeResult[] = []
      let cancelled = false

      const openBatchDialog = () => {
        dialogsStore.sceneScraperMultiple.show = true
      }

      this.clearBatchTask()
      this.autoScrapeInProgress = true
      this.autoScrapeCancelled = false
      dialogsStore.sceneScraperMultiple.items = mediaItems.map((media) => ({
        media: { id: media.id, name: media.name },
        status: 'pending',
      }))
      dialogsStore.sceneScraperMultiple.progress = 0
      dialogsStore.sceneScraperMultiple.show = true

      this.batchTaskId = tasksStore.setTask({
        title: t('scene_scraper.auto_scrape_multiple'),
        subtitle: t('scene_scraper.auto_scrape_progress', { processed: 0, total: mediaItems.length }),
        icon: 'movie-search',
        progress: 0,
        click: openBatchDialog,
        action: () => this.cancelAutoScrape(),
      })
      const currentTaskId = this.batchTaskId

      try {
        for (let index = 0; index < mediaItems.length; index++) {
          if (this.autoScrapeCancelled) {
            cancelled = true
            for (let pendingIndex = index; pendingIndex < mediaItems.length; pendingIndex++) {
              const pendingEntry = dialogsStore.sceneScraperMultiple.items[pendingIndex]
              if (pendingEntry.status === 'pending') {
                pendingEntry.status = 'error'
                pendingEntry.error = 'cancelled'
              }
            }
            break
          }

          const media = mediaItems[index]
          const entry = dialogsStore.sceneScraperMultiple.items[index]
          entry.status = 'searching'

          const result = await this.autoScrapeMedia({ media, requireExactOshash })
          if (this.autoScrapeCancelled) {
            cancelled = true
            entry.status = 'error'
            entry.error = 'cancelled'
            break
          }

          entry.sceneTitle = result.sceneTitle
          if (result.success) {
            entry.status = 'done'
          } else if (result.error === 'not_found' || result.error === 'not_exact_match') {
            entry.status = 'not_found'
            entry.error = result.error
          } else {
            entry.status = 'error'
            entry.error = result.error
          }

          results.push(result)
          const progress = Math.round(((index + 1) / mediaItems.length) * 100)
          dialogsStore.sceneScraperMultiple.progress = progress
          tasksStore.updateTask(currentTaskId, {
            subtitle: t('scene_scraper.auto_scrape_progress', {
              processed: index + 1,
              total: mediaItems.length,
            }),
            progress,
          })
        }
      } finally {
        this.autoScrapeInProgress = false
        cancelled = cancelled || this.autoScrapeCancelled
        this.autoScrapeCancelled = false
        if (!cancelled) {
          dialogsStore.sceneScraperMultiple.progress = 100
        }

        const successCount = results.filter((item) => item.success).length
        const failedCount = results.length - successCount
        tasksStore.updateTask(currentTaskId, {
          subtitle: cancelled
            ? t('scene_scraper.auto_scrape_batch_stopped_summary', {
              success: successCount,
              remaining: Math.max(mediaItems.length - results.length, 0),
              total: mediaItems.length,
            })
            : t('scene_scraper.auto_scrape_batch_summary', {
              success: successCount,
              failed: failedCount,
            }),
          progress: cancelled ? dialogsStore.sceneScraperMultiple.progress : 100,
          color: cancelled ? 'warning' : failedCount > 0 ? 'warning' : 'success',
          done: true,
          action: () => {},
        })
      }

      return {
        results,
        cancelled,
        total: mediaItems.length,
      }
    },
  },
})

export default useSceneScraperStore
