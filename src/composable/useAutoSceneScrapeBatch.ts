import { typedApi } from '@/services/typedApi'
import { useItemsStore } from '@/stores/items'
import { useNotificationsStore } from '@/stores/notifications'
import { useSettingsStore } from '@/stores/settings'
import { useSceneScraperStore } from '@/stores/sceneScraper'
import { useEventBus } from '@/utils/eventBus'
import { resolveSelectedMediaItems } from '@/utils/resolveSelection'
import { getCurrentMediaType, isVideoMediaType } from '@/utils/mediaType'
import { useAppStore } from '@/stores/app'
import translate, { type Locale } from '@/utils/translate'
import { buildSceneScrapeSuccessNotificationText } from '@/utils/sceneScraperMarkerSummary'
import type { MediaItem } from '@/types/stores'
import type { MediaType } from '@/types/media'

function isVideoMediaItem(media: MediaItem, mediaTypes: MediaType[]): boolean {
  const mediaType = getCurrentMediaType(mediaTypes, media.mediaTypeId)
  return isVideoMediaType(mediaType)
}

export function filterSceneScrapeMediaItems(
  mediaItems: MediaItem[],
  mediaTypes: MediaType[],
): MediaItem[] {
  return mediaItems.filter((media) => isVideoMediaItem(media, mediaTypes))
}

export async function getAllVideoMediaForType(mediaTypeId: number): Promise<MediaItem[]> {
  const response = await typedApi.getMediaIds({ mediaTypeId })
  const ids = response.data.ids || []
  if (!ids.length) return []

  const basics = await typedApi.getMediaBasics({ ids })
  return basics.data.items || []
}

export function useAutoSceneScrapeBatch() {
  const itemsStore = useItemsStore()
  const sceneScraperStore = useSceneScraperStore()
  const notificationsStore = useNotificationsStore()
  const settingsStore = useSettingsStore()
  const appStore = useAppStore()
  const eventBus = useEventBus()

  async function runBatch(mediaItems: MediaItem[], {
    clearSelection = true,
  }: {
    clearSelection?: boolean
  } = {}) {
    const videos = filterSceneScrapeMediaItems(mediaItems, appStore.mediaTypes || [])
    if (!videos.length) return []

    const locale = settingsStore.locale as Locale
    const t = (key: string, params: Record<string, string | number> = {}) =>
      translate(key, params, locale)

    const { results, cancelled, total } = await sceneScraperStore.autoScrapeMediaItems({
      mediaItems: videos,
      requireExactOshash: true,
    })

    const successCount = results.filter((item) => item.success).length
    const successfulIds = results.filter((item) => item.success).map((item) => item.mediaId)

    if (cancelled) {
      notificationsStore.setNotification({
        type: 'info',
        title: t('scene_scraper.auto_scrape_batch_stopped'),
        text: t('scene_scraper.auto_scrape_batch_stopped_summary', {
          success: successCount,
          remaining: Math.max(total - results.length, 0),
          total,
        }),
      })
    } else {
      const failedCount = results.length - successCount
      const markersImported = results.reduce(
        (sum, item) => sum + (item.success ? (item.markersImported ?? 0) : 0),
        0,
      )
      const batchSummary = t('scene_scraper.auto_scrape_batch_summary', {
        success: successCount,
        failed: failedCount,
      })
      const markerSummary = settingsStore.sceneScraperImportMarkers === '1' && markersImported > 0
        ? t('scene_scraper.markers_imported_summary', { count: markersImported })
        : null

      notificationsStore.setNotification({
        type: failedCount === results.length ? 'error' : failedCount > 0 ? 'warning' : 'success',
        title: t('scene_scraper.auto_scrape_batch_done'),
        text: markerSummary ? `${batchSummary} · ${markerSummary}` : batchSummary,
      })
    }

    if (successfulIds.length) {
      eventBus.emit('getItemsFromDb', {
        ids: successfulIds,
        type: 'media',
      })
      eventBus.emit('getTags')

      for (const mediaId of successfulIds) {
        itemsStore.refreshThumb(mediaId, { regenerate: true })
      }
    }

    if (clearSelection) {
      itemsStore.isSelect = false
      itemsStore.selection = []
    }

    return results
  }

  async function runForSelection() {
    const mediaItems = await resolveSelectedMediaItems(itemsStore.selection)
    return runBatch(mediaItems)
  }

  async function runForAll(mediaTypeId: number) {
    const mediaItems = await getAllVideoMediaForType(mediaTypeId)
    return runBatch(mediaItems, { clearSelection: false })
  }

  async function runForMedia(media: MediaItem, {
    openManualOnMiss = true,
  }: {
    openManualOnMiss?: boolean
  } = {}) {
    const result = await sceneScraperStore.autoScrapeMedia({
      media,
      requireExactOshash: true,
    })

    const locale = settingsStore.locale as Locale
    const t = (key: string, params: Record<string, string | number> = {}) =>
      translate(key, params, locale)

    if (result.success) {
      notificationsStore.setNotification({
        type: 'success',
        title: t('scene_scraper.auto_scrape_done'),
        text: buildSceneScrapeSuccessNotificationText({
          sceneTitle: result.sceneTitle,
          mediaName: result.mediaName,
          markersImported: result.markersImported,
          importMarkersEnabled: settingsStore.sceneScraperImportMarkers === '1',
          t,
        }),
      })
      eventBus.emit('getItemsFromDb', { ids: [media.id], type: 'media' })
      itemsStore.refreshThumb(media.id, { regenerate: true })
      return result
    }

    if (result.error === 'not_exact_match' && openManualOnMiss) {
      const { useDialogsStore } = await import('@/stores/dialogs')
      const dialogsStore = useDialogsStore()
      dialogsStore.sceneScraper.media = {...media}
      dialogsStore.sceneScraper.show = true
      return result
    }

    notificationsStore.setNotification({
      type: 'warning',
      title: t('scene_scraper.auto_scrape_failed'),
      text: t(`scene_scraper.auto_scrape_error.${result.error || 'api_error'}`),
    })

    return result
  }

  return {
    runBatch,
    runForSelection,
    runForAll,
    runForMedia,
  }
}
