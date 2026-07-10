import { useItemsStore } from '@/stores/items'
import { useScraperStore } from '@/stores/scraper'
import { useNotificationsStore } from '@/stores/notifications'
import { useSettingsStore } from '@/stores/settings'
import { useEventBus } from '@/utils/eventBus'
import translate, { type Locale } from '@/utils/translate'
import { getAllTagsForMeta, resolveSelectedTags } from '@/utils/resolveSelectedTags'
import type { Meta, Tag } from '@/types/stores'

export function useAutoScrapeBatch() {
  const itemsStore = useItemsStore()
  const scraperStore = useScraperStore()
  const notificationsStore = useNotificationsStore()
  const settingsStore = useSettingsStore()
  const eventBus = useEventBus()

  async function runBatch(tags: Tag[], meta: Meta, {
    clearSelection = true,
  }: {
    clearSelection?: boolean
  } = {}) {
    if (!tags.length || !meta) return []

    const locale = settingsStore.locale as Locale
    const t = (key: string, params: Record<string, string | number> = {}) =>
      translate(key, params, locale)

    const results = await scraperStore.autoScrapeTags({ tags, meta })

    const successCount = results.filter((item) => item.success).length
    const failedCount = results.length - successCount

    notificationsStore.setNotification({
      type: failedCount === results.length ? 'error' : failedCount > 0 ? 'warning' : 'success',
      title: t('scraper.auto_scrape_batch_done'),
      text: t('scraper.auto_scrape_batch_summary', {
        success: successCount,
        failed: failedCount,
      }),
    })

    eventBus.emit('getItemsFromDb', {
      ids: tags.map((tag) => tag.id),
      type: 'tag',
    })
    eventBus.emit('getTags')

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
    return runBatch(tags, meta, { clearSelection: false })
  }

  return {
    runBatch,
    runForSelection,
    runForAll,
  }
}
