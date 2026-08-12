import {useRouter} from 'vue-router'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useReviewModeStore} from '@/stores/reviewMode'
import {getDefaultMediaTypeId} from '@/utils/mediaType'
import {setNotification} from '@/services/notificationService'
import type {MediaItem} from '@/types/stores'

function collectReviewMedia(itemsStore: ReturnType<typeof useItemsStore>): MediaItem[] {
  const source = itemsStore.entities.length
    ? itemsStore.entities
    : itemsStore.itemsOnPage
  return (source as MediaItem[]).filter((item) => Number(item?.id) > 0)
}

export function useReviewModeLauncher() {
  const router = useRouter()
  const {t} = useI18n()
  const appStore = useAppStore()
  const itemsStore = useItemsStore()
  const reviewStore = useReviewModeStore()

  async function ensureMediaPage() {
    if (itemsStore.type === 'media' && router.currentRoute.value.path.startsWith('/media')) {
      return true
    }
    const mediaTypeId = itemsStore.environment?.media_type_id
      ?? getDefaultMediaTypeId(appStore.mediaTypes)
    if (mediaTypeId == null) return false
    await router.push(`/media?mediaTypeId=${mediaTypeId}`)
    // Allow LayoutItems to register and load the list.
    await new Promise((resolve) => setTimeout(resolve, 180))
    return true
  }

  async function openReviewMode(options: {startId?: number | null} = {}) {
    await ensureMediaPage()

    const media = collectReviewMedia(itemsStore)
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

    const ok = reviewStore.open(media, startId)
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
