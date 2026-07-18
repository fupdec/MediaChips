import {useItemsStore} from '@/stores/items'
import {useAppStore} from '@/stores/app'
import {useDialogsStore} from '@/stores/dialogs'
import {useNotificationsStore} from '@/stores/notifications'
import {useSettingsStore} from '@/stores/settings'
import {useEventBus} from '@/utils/eventBus'
import translate, {type Locale} from '@/utils/translate'
import {resolveSelectedTags, getAllTagsForMeta} from '@/utils/resolveSelectedTags'
import {autoScrapeTmdbPersonTag, type TmdbPersonAutoScrapeResult} from '../services/tmdbPersonAutoScrape'
import type {Meta, Tag} from '@/types/stores'

let autoScrapeInProgress = false
let autoScrapeCancelled = false

export function useTmdbPersonAutoScrapeBatch() {
  const itemsStore = useItemsStore()
  const appStore = useAppStore()
  const dialogsStore = useDialogsStore()
  const notificationsStore = useNotificationsStore()
  const settingsStore = useSettingsStore()
  const eventBus = useEventBus()

  async function runBatch(tags: Tag[], meta: Meta, {
    clearSelection = true,
  }: {
    clearSelection?: boolean
  } = {}) {
    if (!tags.length || !meta || autoScrapeInProgress) return []

    const locale = settingsStore.locale as Locale
    const t = (key: string, params: Record<string, string | number> = {}) =>
      translate(key, params, locale)

    autoScrapeInProgress = true
    autoScrapeCancelled = false
    const results: TmdbPersonAutoScrapeResult[] = []
    const total = tags.length

    dialogsStore.process.show = true
    dialogsStore.process.text = t('tmdb.auto_scrape_progress', {processed: 0, total})

    try {
      for (let index = 0; index < tags.length; index += 1) {
        if (autoScrapeCancelled) break
        const tag = tags[index]
        dialogsStore.process.text = t('tmdb.auto_scrape_progress_item', {
          processed: index + 1,
          total,
          name: tag.name || '',
        })

        const result = await autoScrapeTmdbPersonTag({
          tag,
          meta,
          dbPath: appStore.dbPath,
        })
        results.push(result)

        if (result.success) {
          eventBus.emit('getItemsFromDb', {ids: [result.tagId], type: 'tag'})
        }
      }
    } finally {
      dialogsStore.process.show = false
      dialogsStore.process.text = null
      autoScrapeInProgress = false
    }

    const successCount = results.filter((item) => item.success).length
    const failedCount = results.length - successCount
    const cancelled = autoScrapeCancelled

    if (cancelled) {
      notificationsStore.setNotification({
        type: 'info',
        title: t('tmdb.auto_scrape_batch_stopped'),
        text: t('tmdb.auto_scrape_batch_stopped_summary', {
          success: successCount,
          remaining: Math.max(total - results.length, 0),
          total,
        }),
      })
    } else {
      notificationsStore.setNotification({
        type: failedCount === results.length ? 'error' : failedCount > 0 ? 'warning' : 'success',
        title: t('tmdb.auto_scrape_batch_done'),
        text: t('tmdb.auto_scrape_batch_summary', {
          success: successCount,
          failed: failedCount,
        }),
      })
    }

    if (successCount) {
      eventBus.emit('getTags')
      eventBus.emit('getMeta')
    }

    if (clearSelection) {
      itemsStore.isSelect = false
      itemsStore.selection = []
    }

    return results
  }

  async function runForSelection(meta: Meta) {
    const tags = resolveSelectedTags(itemsStore.selection)
    return runBatch(tags, meta)
  }

  async function runForAll(meta: Meta) {
    const tags = getAllTagsForMeta(meta.id)
    return runBatch(tags, meta, {clearSelection: false})
  }

  function cancel() {
    autoScrapeCancelled = true
  }

  function isInProgress() {
    return autoScrapeInProgress
  }

  return {
    runBatch,
    runForSelection,
    runForAll,
    cancel,
    isInProgress,
  }
}
