import {useRouter} from 'vue-router'
import {useI18n} from 'vue-i18n'
import {useSessionFocusStore, type SessionFocusTag} from '@/stores/sessionFocus'
import {useOpenMediaList} from '@/utils/openMediaList'
import {
  buildSessionFocusWithTagFilters,
  buildSessionFocusWithoutTagFilters,
} from '@/utils/sessionFocusFilters'
import {typedApi} from '@/services/typedApi'
import {useItemsListSync} from '@/composable/itemsListSync'
import {setNotification} from '@/services/notificationService'
import {getDefaultMediaTypeId} from '@/utils/mediaType'
import {useAppStore} from '@/stores/app'

export function useSessionFocusActions() {
  const focusStore = useSessionFocusStore()
  const {openMediaList} = useOpenMediaList()
  const router = useRouter()
  const {t} = useI18n()
  const listSync = useItemsListSync()
  const appStore = useAppStore()

  function startFocus(tag: SessionFocusTag) {
    focusStore.setFocus(tag)
    setNotification({
      type: 'success',
      title: t('session_focus.started_title'),
      text: t('session_focus.started_text', {name: tag.name}),
      icon: 'bullseye-arrow',
    })
  }

  function clearFocus() {
    const name = focusStore.tag?.name
    focusStore.clearFocus()
    if (name) {
      setNotification({
        type: 'info',
        title: t('session_focus.cleared_title'),
        text: name,
        icon: 'bullseye',
      })
    }
  }

  async function browseWithFocus(mediaTypeId?: number) {
    const tag = focusStore.tag
    if (!tag) return
    await openMediaList({
      mediaTypeId: mediaTypeId ?? getDefaultMediaTypeId(appStore.mediaTypes) ?? undefined,
      filters: buildSessionFocusWithTagFilters(tag),
    })
  }

  async function browseWithoutFocus(mediaTypeId?: number) {
    const tag = focusStore.tag
    if (!tag) return
    await openMediaList({
      mediaTypeId: mediaTypeId ?? getDefaultMediaTypeId(appStore.mediaTypes) ?? undefined,
      filters: buildSessionFocusWithoutTagFilters(tag),
    })
  }

  function openFocusTagPage() {
    const tag = focusStore.tag
    if (!tag) return
    void router.push(`/tag?tagId=${tag.tagId}&metaId=${tag.metaId}`)
  }

  async function applyFocusTagToMediaIds(mediaIds: number[]): Promise<number> {
    const tag = focusStore.tag
    if (!tag) return 0
    const ids = [...new Set(mediaIds.map(Number).filter((id) => Number.isFinite(id) && id > 0))]
    if (!ids.length) return 0

    let applied = 0
    for (const mediaId of ids) {
      try {
        const response = await typedApi.createTagsInMediaOne({
          mediaId,
          tagId: tag.tagId,
          metaId: tag.metaId,
        })
        if (response.data?.[1]) applied += 1
      } catch (error) {
        console.error(error)
      }
    }

    if (applied > 0) {
      listSync.getItemsFromDb({ids, type: 'media'})
    }

    setNotification({
      type: applied > 0 ? 'success' : 'info',
      title: t('session_focus.apply_title'),
      text: t('session_focus.apply_text', {count: applied, name: tag.name}),
      icon: 'tag-plus',
    })

    return applied
  }

  return {
    startFocus,
    clearFocus,
    browseWithFocus,
    browseWithoutFocus,
    openFocusTagPage,
    applyFocusTagToMediaIds,
  }
}
