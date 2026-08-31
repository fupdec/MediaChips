import router from '@/router'
import {typedApi} from '@/services/typedApi'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useSettingsStore} from '@/stores/settings'
import {useDialogsStore} from '@/stores/dialogs'
import {useNotificationsStore} from '@/stores/notifications'
import {useItemsListSync} from '@/composable/itemsListSync'
import {reloadTagsCatalog} from '@/composable/appCatalogs'
import translate, {type Locale} from '@/utils/translate'
import {getApiErrorMessage, getErrorResponseData} from '@/types/vue'
import type {Tag} from '@/types/stores'

function normalizeTagNameKey(name: string | null | undefined): string {
  return String(name ?? '').trim().toLowerCase()
}

export type MoveTagsOptions = {
  /** Clear items-page selection after a successful move (default true). */
  clearSelection?: boolean
  /** Remove moved/merged ids from the current items list (default true). */
  syncItemsList?: boolean
  /** Navigate to target category after success toast action (default true). */
  allowOpenCategoryAction?: boolean
}

export function useMoveTagsToCategory() {
  const appStore = useAppStore()
  const itemsStore = useItemsStore()
  const settingsStore = useSettingsStore()
  const dialogsStore = useDialogsStore()
  const notificationsStore = useNotificationsStore()
  const listSync = useItemsListSync()

  function findMoveNameConflicts(tagsToMove: Tag[], targetMetaId: number): Tag[] {
    const movingIds = new Set(tagsToMove.map((tag) => Number(tag.id)))
    const existingByName = new Map<string, Tag>()
    for (const tag of appStore.tags || []) {
      if (Number(tag.metaId) !== targetMetaId) continue
      if (movingIds.has(Number(tag.id))) continue
      const key = normalizeTagNameKey(tag.name)
      if (!key || existingByName.has(key)) continue
      existingByName.set(key, tag)
    }

    return tagsToMove.filter((tag) => {
      const key = normalizeTagNameKey(tag.name)
      return Boolean(key && existingByName.has(key))
    })
  }

  async function runMoveTagsToCategory(
    tagsToMove: Tag[],
    targetMetaId: number,
    targetName: string,
    onConflict: 'merge' | 'abort',
    options: MoveTagsOptions = {},
  ): Promise<boolean> {
    if (!tagsToMove.length) return false

    const {
      clearSelection = true,
      syncItemsList = true,
      allowOpenCategoryAction = true,
    } = options

    const locale = settingsStore.locale as Locale
    const t = (key: string, params: Record<string, string | number> = {}) =>
      translate(key, params, locale)

    try {
      const result = await typedApi.moveTagsToCategory({
        tagIds: tagsToMove.map((tag) => Number(tag.id)),
        targetMetaId,
        onConflict,
      })

      const removedIds = [
        ...new Set([
          ...(result.data.movedIds || []),
          ...(result.data.mergedIds || []),
        ]),
      ]

      if (syncItemsList && removedIds.length) {
        listSync.removeEntitiesFromState({
          ids: removedIds,
          type: 'tag',
        })
      }

      if (clearSelection) {
        itemsStore.selection = []
        itemsStore.selected_last = null
        itemsStore.isSelect = false
      }

      void reloadTagsCatalog()

      const movedCount = removedIds.length
      if (!movedCount) return true

      notificationsStore.setNotification({
        type: 'success',
        title: t('context_menu.move_to_tag_category_done'),
        text: t('context_menu.move_to_tag_category_done_text', {
          count: movedCount,
          category: targetName,
        }),
        timeout: 10000,
        actions: allowOpenCategoryAction
          ? [
              {
                id: 'open-moved-category',
                text: t('context_menu.move_to_tag_category_open'),
                icon: 'folder-open',
                close: true,
                action: () => {
                  void router.push(`/meta?metaId=${targetMetaId}`)
                },
              },
            ]
          : [],
      })
      return true
    } catch (error) {
      console.error(error)
      const errorData = getErrorResponseData<{
        message?: string
        code?: string
        unassignedMediaTypes?: Array<{id: number; name: string}>
      }>(error)

      if (errorData?.code === 'unassigned_media_types') {
        const types = (errorData.unassignedMediaTypes || [])
          .map((row) => row.name)
          .filter(Boolean)
          .join(', ')
        notificationsStore.setNotification({
          type: 'warning',
          title: t('context_menu.move_to_tag_category_blocked'),
          text: t('context_menu.move_to_tag_category_unassigned', {
            category: targetName,
            types: types || errorData.message || '',
          }),
          timeout: 12000,
        })
        return false
      }

      notificationsStore.setNotification({
        type: 'error',
        title: t('context_menu.move_to_tag_category_failed'),
        text: errorData?.message
          || getApiErrorMessage(error, t('context_menu.move_to_tag_category_failed')),
      })
      return false
    }
  }

  function moveTagsToCategory(
    tagsToMove: Tag[],
    targetMetaId: number,
    targetName: string,
    options: MoveTagsOptions = {},
  ): void {
    if (!tagsToMove.length || !Number.isFinite(targetMetaId) || targetMetaId <= 0) return

    const locale = settingsStore.locale as Locale
    const t = (key: string, params: Record<string, string | number> = {}) =>
      translate(key, params, locale)

    const conflicts = findMoveNameConflicts(tagsToMove, targetMetaId)
    if (conflicts.length) {
      const names = conflicts.map((tag) => String(tag.name ?? '')).filter(Boolean).join(', ')
      dialogsStore.confirm.text = t('context_menu.move_to_tag_category_conflict', {
        names,
        category: targetName,
        count: conflicts.length,
      })
      dialogsStore.confirm.checkBoxText = ''
      dialogsStore.confirm.checkBox = false
      dialogsStore.confirm.action = () => {
        void runMoveTagsToCategory(tagsToMove, targetMetaId, targetName, 'merge', options)
      }
      dialogsStore.confirm.show = true
      return
    }

    void runMoveTagsToCategory(tagsToMove, targetMetaId, targetName, 'abort', options)
  }

  return {
    findMoveNameConflicts,
    runMoveTagsToCategory,
    moveTagsToCategory,
  }
}
