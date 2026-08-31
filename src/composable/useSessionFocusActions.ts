import router from '@/router'
import {useSessionFocusStore, type SessionFocusTag} from '@/stores/sessionFocus'
import {useOpenMediaList} from '@/utils/openMediaList'
import {
  buildSessionFocusWithTagFilters,
  buildSessionFocusWithoutTagFilters,
} from '@/utils/sessionFocusFilters'
import {typedApi} from '@/services/typedApi'
import {useItemsListSync} from '@/composable/itemsListSync'
import {getDefaultMediaTypeId} from '@/utils/mediaType'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {setNotification} from '@/services/notificationService'
import translate, {type Locale} from '@/utils/translate'
import {useSettingsStore} from '@/stores/settings'
import type {MediaItem, Tag} from '@/types/stores'

export type SessionFocusItemType = 'media' | 'tag'

function createdFromResponse(data: unknown): boolean {
  return Array.isArray(data) && data[1] === true
}

function itemHasTag(item: MediaItem | Tag | undefined, tagId: number): boolean {
  if (!item?.tags) return false
  return item.tags.some((entry) => Number(entry.tagId) === tagId)
}

/**
 * Safe to call from card context-menu handlers (outside setup): uses the router
 * singleton instead of useRouter() inject.
 */
export function useSessionFocusActions() {
  const focusStore = useSessionFocusStore()
  const {openMediaList} = useOpenMediaList()
  const listSync = useItemsListSync()
  const appStore = useAppStore()
  const itemsStore = useItemsStore()
  const settingsStore = useSettingsStore()

  function t(key: string, params: Record<string, string | number> = {}) {
    return translate(key, params, settingsStore.locale as Locale)
  }

  function enrichTag(tag: SessionFocusTag): SessionFocusTag {
    const catalog = appStore.getTagById(tag.tagId)
    const meta = appStore.getMetaById(tag.metaId)
    return {
      tagId: tag.tagId,
      metaId: tag.metaId,
      name: tag.name || String(catalog?.name || ''),
      icon: tag.icon ?? (meta?.icon ? String(meta.icon) : null),
      color: tag.color ?? (catalog?.color ? String(catalog.color) : null),
    }
  }

  function startFocus(tag: SessionFocusTag) {
    focusStore.addTag(enrichTag(tag))
  }

  function addToTray(tag: SessionFocusTag) {
    focusStore.addTag(enrichTag(tag))
  }

  function addTagsToTray(tags: SessionFocusTag[]) {
    focusStore.addTags(tags.map(enrichTag))
  }

  function removeFromTray(tagId: number) {
    focusStore.removeTag(tagId)
  }

  function toggleInTray(tag: SessionFocusTag) {
    if (focusStore.hasTag(tag.tagId)) {
      focusStore.removeTag(tag.tagId)
      return
    }
    addToTray(tag)
  }

  function clearFocus() {
    focusStore.clearFocus()
  }

  async function browseWithFocus(mediaTypeId?: number) {
    if (!focusStore.tags.length) return
    await openMediaList({
      mediaTypeId: mediaTypeId ?? getDefaultMediaTypeId(appStore.mediaTypes) ?? undefined,
      filters: buildSessionFocusWithTagFilters(focusStore.tags),
    })
  }

  async function browseWithoutFocus(mediaTypeId?: number) {
    if (!focusStore.tags.length) return
    await openMediaList({
      mediaTypeId: mediaTypeId ?? getDefaultMediaTypeId(appStore.mediaTypes) ?? undefined,
      filters: buildSessionFocusWithoutTagFilters(focusStore.tags),
    })
  }

  function openFocusTagPage(tag?: SessionFocusTag | null) {
    const target = tag ?? focusStore.tag
    if (!target) return
    void router.push(`/tag?tagId=${target.tagId}&metaId=${target.metaId}`)
  }

  function resolveTargetIds(explicitIds?: number[]): {ids: number[]; type: SessionFocusItemType} | null {
    const type = itemsStore.type === 'tag' ? 'tag' : itemsStore.type === 'media' ? 'media' : null
    if (!type) return null
    if (explicitIds?.length) {
      const ids = [...new Set(explicitIds.map(Number).filter((id) => Number.isFinite(id) && id > 0))]
      return ids.length ? {ids, type} : null
    }
    if (itemsStore.selection.length) {
      const ids = [...new Set(itemsStore.selection.map(Number).filter((id) => Number.isFinite(id) && id > 0))]
      return ids.length ? {ids, type} : null
    }
    const focused = Number(itemsStore.selected_last)
    if (Number.isFinite(focused) && focused > 0) return {ids: [focused], type}
    return null
  }

  async function applyTrayToItems(
    itemIds: number[],
    type: SessionFocusItemType,
  ): Promise<number> {
    const tags = focusStore.tags
    if (!tags.length) return 0
    const ids = [...new Set(itemIds.map(Number).filter((id) => Number.isFinite(id) && id > 0))]
    if (!ids.length) return 0

    let applied = 0
    const touched = new Set<number>()
    for (const itemId of ids) {
      const item = itemsStore.getItemById(itemId)
        ?? itemsStore.itemsOnPage.find((entry) => Number(entry.id) === itemId)
        ?? itemsStore.entities.find((entry) => Number(entry.id) === itemId)
      for (const tag of tags) {
        if (type === 'tag' && Number(tag.tagId) === itemId) continue
        if (itemHasTag(item, tag.tagId)) continue
        try {
          if (type === 'media') {
            const response = await typedApi.createTagsInMediaOne({
              mediaId: itemId,
              tagId: tag.tagId,
              metaId: tag.metaId,
            })
            if (createdFromResponse(response.data)) {
              applied += 1
              touched.add(itemId)
            }
          } else {
            const response = await typedApi.createTagsInTagOne({
              parentTagId: itemId,
              tagId: tag.tagId,
              metaId: tag.metaId,
            })
            if (createdFromResponse(response.data)) {
              applied += 1
              touched.add(itemId)
            }
          }
        } catch (error) {
          console.error(error)
        }
      }
    }

    if (touched.size > 0) {
      listSync.getItemsFromDb({ids: [...touched], type})
      setNotification({
        type: 'success',
        title: t('session_focus.apply_title'),
        text: t('session_focus.apply_all_text', {
          count: touched.size,
          name: focusStore.namesLabel,
        }),
      })
    }

    return applied
  }

  async function removeTrayFromItems(
    itemIds: number[],
    type: SessionFocusItemType,
  ): Promise<number> {
    const tags = focusStore.tags
    if (!tags.length) return 0
    const ids = [...new Set(itemIds.map(Number).filter((id) => Number.isFinite(id) && id > 0))]
    if (!ids.length) return 0

    let removed = 0
    const touched = new Set<number>()
    for (const itemId of ids) {
      const item = itemsStore.getItemById(itemId)
        ?? itemsStore.itemsOnPage.find((entry) => Number(entry.id) === itemId)
        ?? itemsStore.entities.find((entry) => Number(entry.id) === itemId)
      for (const tag of tags) {
        if (item && !itemHasTag(item, tag.tagId)) continue
        try {
          const body = type === 'media'
            ? {mediaId: itemId, tagId: tag.tagId}
            : {parentTagId: itemId, tagId: tag.tagId}
          await typedApi.removeTagFromItem(type, body)
          itemsStore.removeTagFromItem({itemId, tagId: tag.tagId})
          removed += 1
          touched.add(itemId)
        } catch (error) {
          console.error(error)
        }
      }
    }

    if (touched.size > 0) {
      listSync.getItemsFromDb({ids: [...touched], type})
      setNotification({
        type: 'info',
        title: t('session_focus.apply_title'),
        text: t('session_focus.remove_all_text', {
          count: touched.size,
          name: focusStore.namesLabel,
        }),
      })
    }

    return removed
  }

  async function applyFocusTagToMediaIds(mediaIds: number[]): Promise<number> {
    return applyTrayToItems(mediaIds, 'media')
  }

  async function applyTrayToCurrentTargets(): Promise<boolean> {
    const target = resolveTargetIds()
    if (!target) return false
    await applyTrayToItems(target.ids, target.type)
    return true
  }

  async function removeTrayFromCurrentTargets(): Promise<boolean> {
    const target = resolveTargetIds()
    if (!target) return false
    await removeTrayFromItems(target.ids, target.type)
    return true
  }

  async function applyTagToItem(
    tag: SessionFocusTag,
    itemId: number,
    type: SessionFocusItemType,
  ): Promise<boolean> {
    const id = Number(itemId)
    if (!Number.isFinite(id) || id <= 0) return false
    if (type === 'tag' && Number(tag.tagId) === id) return false
    try {
      if (type === 'media') {
        const response = await typedApi.createTagsInMediaOne({
          mediaId: id,
          tagId: tag.tagId,
          metaId: tag.metaId,
        })
        if (!createdFromResponse(response.data)) return false
      } else {
        const response = await typedApi.createTagsInTagOne({
          parentTagId: id,
          tagId: tag.tagId,
          metaId: tag.metaId,
        })
        if (!createdFromResponse(response.data)) return false
      }
      listSync.getItemsFromDb({ids: [id], type})
      return true
    } catch (error) {
      console.error(error)
      return false
    }
  }

  return {
    startFocus,
    addToTray,
    addTagsToTray,
    removeFromTray,
    toggleInTray,
    clearFocus,
    browseWithFocus,
    browseWithoutFocus,
    openFocusTagPage,
    applyFocusTagToMediaIds,
    applyTrayToItems,
    removeTrayFromItems,
    applyTrayToCurrentTargets,
    removeTrayFromCurrentTargets,
    applyTagToItem,
    resolveTargetIds,
  }
}
