import {useRouter} from 'vue-router'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useReviewModeStore} from '@/stores/reviewMode'
import {getDefaultMediaTypeId} from '@/utils/mediaType'
import {setNotification} from '@/services/notificationService'
import type {MediaItem} from '@/types/stores'
import type {ReviewModeSource} from '@/stores/reviewMode'

function collectReviewMedia(itemsStore: ReturnType<typeof useItemsStore>): MediaItem[] {
  const source = itemsStore.entities.length
    ? itemsStore.entities
    : itemsStore.itemsOnPage
  return (source as MediaItem[]).filter((item) => Number(item?.id) > 0)
}

export type OpenReviewModeLauncherOptions = {
  startId?: number | null
  /** Explicit queue — used by Inbox pending handoff. */
  media?: MediaItem[]
  source?: ReviewModeSource
}

export function useReviewModeLauncher() {
  const router = useRouter()
  const {t} = useI18n()
  const appStore = useAppStore()
  const itemsStore = useItemsStore()
  const reviewStore = useReviewModeStore()

  async function ensureMediaPage(mediaTypeId?: number | null) {
    // Tag / folder / playlist / media browse all use type=media with a live list —
    // stay put so Review opens on the current page instead of jumping to /media.
    if (itemsStore.type === 'media') {
      return true
    }
    const targetId = mediaTypeId
      ?? itemsStore.environment?.media_type_id
      ?? getDefaultMediaTypeId(appStore.mediaTypes)
    if (targetId == null) return false
    await router.push(`/media?mediaTypeId=${targetId}`)
    // Allow LayoutItems to register and load the list.
    await new Promise((resolve) => setTimeout(resolve, 180))
    return true
  }

  async function openReviewMode(options: OpenReviewModeLauncherOptions = {}) {
    const explicit = (options.media || []).filter((item) => Number(item?.id) > 0)
    const mediaTypeId = explicit.length
      ? Number(explicit[0].mediaTypeId) || null
      : null

    await ensureMediaPage(mediaTypeId)

    const media = explicit.length ? explicit : collectReviewMedia(itemsStore)
    if (!media.length) {
      setNotification({
        type: 'info',
        title: t('review_mode.empty'),
        icon: 'card-search',
      })
      return false
    }

    const startId = options.startId
      ?? itemsStore.selected_last
      ?? itemsStore.selection[0]
      ?? null

    const ok = reviewStore.open(media, startId, {source: options.source ?? null})
    if (!ok) {
      setNotification({
        type: 'info',
        title: t('review_mode.empty'),
        icon: 'card-search',
      })
    }
    return ok
  }

  return {openReviewMode}
}
