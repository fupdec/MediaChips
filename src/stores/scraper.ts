import { defineStore } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useDialogsStore } from '@/stores/dialogs'
import { useItemsStore } from '@/stores/items'
import { useTasksStore } from '@/stores/tasks'
import { useSettingsStore } from '@/stores/settings'
import translate, { type Locale } from '@/utils/translate'
import { searchScraperPerformers } from '@/services/scraperApi'
import { autoApplyScrapedTagData } from '@/services/scraperAutoApply'
import { findBestMatchingPerformer } from '@/utils/scraperMatch'
import { refreshTagThumbDisplay } from '@/utils/tagThumbRefresh'
import type {
  ScraperPerformer,
  ScraperTransferField,
  ScraperPinnedItem,
  ScraperMultiplePerformer,
} from '@/types/scraper'
import type { Meta, Tag } from '@/types/stores'
import type { AutoScrapeBatchOutcome } from '@/types/autoScrapeBatch'

const SCRAPER_API_BASE_URL = import.meta.env.VITE_SCRAPER_API_URL || 'https://mediachips.app/wp-json/mediachips/v1/scraper'

export interface AutoScrapeTagResult {
  success: boolean
  tagId: number
  tagName: string
  performerName?: string
  error?: string
}

export const useScraperStore = defineStore('useScraperStore', {
  state: () => ({
    query: '',
    scraperApiBaseUrl: SCRAPER_API_BASE_URL,
    currentValues: {} as Record<string, unknown>,
    fields: [] as ScraperTransferField[],
    pinned: [] as ScraperPinnedItem[],
    autoScrapeInProgress: false,
    autoScrapeCancelled: false,
    batchTaskId: null as string | null,
  }),
  actions: {
    async searchPerformer({ page = 1, query }: { page?: number; query?: string } = {}) {
      const q = query || this.query
      return searchScraperPerformers(this.scraperApiBaseUrl, {
        gender: 'Female',
        page,
        q,
      })
    },
    async getOnePerformerByQueryString(query: string) {
      const result = await this.searchPerformer({ page: 1, query })
      if (!result?.data?.length) return null
      return findBestMatchingPerformer(query, result.data)
    },
    async autoScrapeTag({
      tag,
      meta,
      query,
    }: {
      tag: Tag
      meta: Meta
      query?: string
    }): Promise<AutoScrapeTagResult> {
      const searchQueries = [query || tag.name || '']
      if (tag.synonyms) {
        for (const synonym of String(tag.synonyms).split(',')) {
          const trimmed = synonym.trim()
          if (trimmed && !searchQueries.includes(trimmed)) {
            searchQueries.push(trimmed)
          }
        }
      }

      let performer: ScraperPerformer | null = null
      let searchQuery = searchQueries[0] || ''

      for (const candidate of searchQueries) {
        if (!candidate) continue
        performer = await this.getOnePerformerByQueryString(candidate)
        if (performer) {
          searchQuery = candidate
          break
        }
      }

      if (!performer) {
        return {
          success: false,
          tagId: tag.id,
          tagName: tag.name || searchQuery,
          error: 'not_found',
        }
      }

      const appStore = useAppStore()
      const itemsStore = useItemsStore()
      const applyResult = await autoApplyScrapedTagData({
        tag,
        meta,
        performer,
        dbPath: appStore.dbPath,
        allTags: [...(appStore.tags || [])],
      })

      if (applyResult.success) {
        refreshTagThumbDisplay(itemsStore, appStore.dbPath, meta.id, tag.id)
      }

      return {
        success: applyResult.success,
        tagId: tag.id,
        tagName: tag.name || searchQuery,
        performerName: applyResult.performerName,
        error: applyResult.error,
      }
    },
    cancelAutoScrape() {
      this.autoScrapeCancelled = true
    },
    clearBatchTask() {
      if (!this.batchTaskId) return
      useTasksStore().removeTask(this.batchTaskId)
      this.batchTaskId = null
    },
    async autoScrapeTags({
      tags,
      meta,
      onProgress,
    }: {
      tags: Tag[]
      meta: Meta
      onProgress?: (progress: number, item: ScraperMultiplePerformer) => void
    }): Promise<AutoScrapeBatchOutcome<AutoScrapeTagResult>> {
      const dialogsStore = useDialogsStore()
      const tasksStore = useTasksStore()
      const settingsStore = useSettingsStore()
      const locale = settingsStore.locale as Locale
      const t = (key: string, params: Record<string, string | number> = {}) =>
        translate(key, params, locale)
      const results: AutoScrapeTagResult[] = []
      let cancelled = false

      const openBatchDialog = () => {
        dialogsStore.scraperMultiple.show = true
      }

      this.clearBatchTask()
      this.autoScrapeInProgress = true
      this.autoScrapeCancelled = false
      dialogsStore.scraperMultiple.performers = tags.map((tag) => ({
        performer: { id: tag.id, name: tag.name },
        result: {},
        status: 'pending',
        tagName: tag.name,
      }))
      dialogsStore.scraperMultiple.progress = 0
      dialogsStore.scraperMultiple.show = true

      this.batchTaskId = tasksStore.setTask({
        title: t('scraper.auto_scrape_multiple'),
        subtitle: t('scraper.auto_scrape_progress', { processed: 0, total: tags.length }),
        icon: 'account-search',
        progress: 0,
        click: openBatchDialog,
        action: () => this.cancelAutoScrape(),
      })
      const currentTaskId = this.batchTaskId

      try {
        for (let index = 0; index < tags.length; index++) {
          if (this.autoScrapeCancelled) {
            cancelled = true
            for (let pendingIndex = index; pendingIndex < tags.length; pendingIndex++) {
              const pendingEntry = dialogsStore.scraperMultiple.performers[pendingIndex]
              if (pendingEntry.status === 'pending') {
                pendingEntry.status = 'error'
                pendingEntry.error = 'cancelled'
              }
            }
            break
          }

          const tag = tags[index]
          const performerEntry = dialogsStore.scraperMultiple.performers[index]
          performerEntry.status = 'searching'

          const result = await this.autoScrapeTag({ tag, meta })
          if (this.autoScrapeCancelled) {
            cancelled = true
            performerEntry.status = 'error'
            performerEntry.error = 'cancelled'
            break
          }

          performerEntry.status = result.success
            ? 'done'
            : result.error === 'not_found'
              ? 'not_found'
              : 'error'
          performerEntry.error = result.error
          performerEntry.result = {
            extras: {},
          }
          performerEntry.matchedName = result.performerName

          results.push(result)
          const progress = Math.round(((index + 1) / tags.length) * 100)
          dialogsStore.scraperMultiple.progress = progress
          tasksStore.updateTask(currentTaskId, {
            subtitle: t('scraper.auto_scrape_progress', {
              processed: index + 1,
              total: tags.length,
            }),
            progress,
          })
          onProgress?.(progress, performerEntry)
        }
      } finally {
        this.autoScrapeInProgress = false
        cancelled = cancelled || this.autoScrapeCancelled
        this.autoScrapeCancelled = false
        if (!cancelled) {
          dialogsStore.scraperMultiple.progress = 100
        }

        const successCount = results.filter((item) => item.success).length
        const failedCount = results.length - successCount
        tasksStore.updateTask(currentTaskId, {
          subtitle: cancelled
            ? t('scraper.auto_scrape_batch_stopped_summary', {
              success: successCount,
              remaining: Math.max(tags.length - results.length, 0),
              total: tags.length,
            })
            : t('scraper.auto_scrape_batch_summary', {
              success: successCount,
              failed: failedCount,
            }),
          progress: cancelled ? dialogsStore.scraperMultiple.progress : 100,
          color: cancelled ? 'warning' : failedCount > 0 ? 'warning' : 'success',
          done: true,
          action: () => {},
        })
      }

      return {
        results,
        cancelled,
        total: tags.length,
      }
    },
    async retryFailedAutoScrape(meta: Meta): Promise<AutoScrapeTagResult[]> {
      const dialogsStore = useDialogsStore()
      const appStore = useAppStore()
      const failedEntries = dialogsStore.scraperMultiple.performers.filter(
        (entry) => (entry.status === 'not_found' || entry.status === 'error')
          && entry.error !== 'cancelled',
      )

      const tags = failedEntries
        .map((entry) => appStore.getTagById(Number(entry.performer.id)))
        .filter((tag): tag is Tag => Boolean(tag))

      if (!tags.length) return []

      const outcome = await this.autoScrapeTags({ tags, meta })
      return outcome.results
    },
    async updateInfoOfPerformer({
      tag,
      meta,
      query,
    }: {
      tag: Tag
      meta: Meta
      query?: string
    } = {} as { tag: Tag; meta: Meta; query?: string }) {
      if (!tag || !meta) return null
      return this.autoScrapeTag({ tag, meta, query: query || tag.name })
    },
  },
})

export default useScraperStore
