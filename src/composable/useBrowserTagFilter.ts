import {nextTick} from 'vue'
import {useRouter, useRoute} from 'vue-router'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useItemsFiltersController} from '@/composable/itemsFiltersController'
import {getFilterObject} from '@/services/formatUtils'
import {mediaTypePath} from '@/composable/useLibraryNavItems'
import type {Tag} from '@/types/stores'

export const BROWSER_SIDEBAR_TAG_NOTE = 'browser-sidebar-tag'

export function useBrowserTagFilter() {
  const router = useRouter()
  const route = useRoute()
  const appStore = useAppStore()
  const itemsStore = useItemsStore()
  const filtersController = useItemsFiltersController()

  function isTagFilterActive(tagId: number): boolean {
    return itemsStore.filters.some((filter) => {
      if (!filter.active) return false
      if (filter.type !== 'array') return false
      const values = Array.isArray(filter.val) ? filter.val : []
      return values.map(Number).includes(Number(tagId))
    })
  }

  async function ensureMediaPage(): Promise<boolean> {
    if (route.path === '/media' && route.query.mediaTypeId) {
      return true
    }

    const mediaTypeId =
      itemsStore.environment.media_type_id
      ?? appStore.mediaTypes.find((item) => !item.hidden)?.id

    if (mediaTypeId == null) return false

    await router.push(mediaTypePath(mediaTypeId))
    await nextTick()
    // Allow LayoutItems / Filters.vue to register the filters controller.
    await new Promise((resolve) => setTimeout(resolve, 120))
    return true
  }

  async function filterByTag(tag: Pick<Tag, 'id' | 'metaId'>): Promise<void> {
    if (tag.metaId == null) return

    const ready = await ensureMediaPage()
    if (!ready) return

    const remaining = itemsStore.filters.filter(
      (filter) => filter.note !== BROWSER_SIDEBAR_TAG_NOTE,
    )

    remaining.push(getFilterObject({
      param: tag.metaId,
      type: 'array',
      cond: 'in all',
      val: [tag.id],
      note: BROWSER_SIDEBAR_TAG_NOTE,
      lock: false,
    }))

    itemsStore.filters = remaining

    setTimeout(() => {
      void filtersController.apply()
    }, 0)
  }

  async function clearBrowserTagFilters(): Promise<void> {
    const before = itemsStore.filters.length
    itemsStore.filters = itemsStore.filters.filter(
      (filter) => filter.note !== BROWSER_SIDEBAR_TAG_NOTE,
    )
    if (itemsStore.filters.length === before) return

    setTimeout(() => {
      void filtersController.apply()
    }, 0)
  }

  return {
    isTagFilterActive,
    filterByTag,
    clearBrowserTagFilters,
  }
}
