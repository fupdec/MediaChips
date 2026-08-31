import {useI18n} from 'vue-i18n'
import {typedApi} from '@/services/typedApi'
import {reloadMetaCatalog} from '@/composable/metaCatalog'
import {setNotification} from '@/services/notificationService'
import {getApiErrorMessage} from '@/types/vue'
import {
  canReparentCategory,
  type MetaLike,
} from '@/utils/tagCategoryTree'
import type {Meta} from '@/types/stores'

export function useHierarchyReparent() {
  const {t} = useI18n()

  async function reparentCategory(
    category: Meta,
    parentMetaId: number | null,
    all: MetaLike[],
    tagsInParent: number,
  ): Promise<boolean> {
    if (Number(category.id) === Number(parentMetaId)) return false
    if (Number(category.parentMetaId ?? 0) === Number(parentMetaId ?? 0)) return false
    if (!canReparentCategory(Number(category.id), parentMetaId, all, tagsInParent)) {
      setNotification({
        type: 'error',
        title: t('context_menu.category_reparent_failed'),
        text: t('all_tags.nest_drop_blocked'),
      })
      return false
    }

    try {
      await typedApi.updateMeta(category.id, parentMetaId == null ? {parentMetaId: undefined} : {parentMetaId})
      await reloadMetaCatalog()
      setNotification({
        type: 'success',
        title: t('context_menu.category_reparent_done'),
      })
      return true
    } catch (error) {
      setNotification({
        type: 'error',
        title: t('context_menu.category_reparent_failed'),
        text: getApiErrorMessage(error, t('context_menu.category_reparent_failed')),
      })
      return false
    }
  }

  return {
    reparentCategory,
  }
}
