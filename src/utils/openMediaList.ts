import {nextTick} from 'vue'
import {useRouter, useRoute} from 'vue-router'
import {useItemsStore} from '@/stores/items'
import {useItemsPageCommands} from '@/composable/itemsPageCommands'
import {useItemsFiltersController} from '@/composable/itemsFiltersController'
import {getDefaultMediaTypeId} from '@/utils/mediaType'
import {useAppStore} from '@/stores/app'
import type {FilterObject} from '@/types/common'

interface OpenMediaListOptions {
  sortBy?: string
  sortDir?: string
  mediaTypeId?: number
  filters?: FilterObject[]
}

async function waitForMediaPageReady() {
  await nextTick()
  // Allow LayoutItems / Filters.vue to register page + filters controllers.
  await new Promise((resolve) => setTimeout(resolve, 120))
}

export function useOpenMediaList() {
  const router = useRouter()
  const route = useRoute()
  const itemsStore = useItemsStore()
  const appStore = useAppStore()
  const pageCommands = useItemsPageCommands()
  const filtersController = useItemsFiltersController()

  const openMediaList = async ({
    sortBy,
    sortDir = 'desc',
    mediaTypeId,
    filters,
  }: OpenMediaListOptions = {}) => {
    const targetMediaTypeId = mediaTypeId ?? getDefaultMediaTypeId(appStore.mediaTypes)
    const alreadyOnPage =
      route.path === '/media'
      && Number(route.query.mediaTypeId) === Number(targetMediaTypeId)

    if (!alreadyOnPage) {
      await router.push(`/media?mediaTypeId=${targetMediaTypeId}`)
      await waitForMediaPageReady()
    }

    if (sortBy) {
      itemsStore.updateState({key: 'sortBy', value: sortBy})
      itemsStore.updateState({key: 'sortDir', value: sortDir})
    }

    if (filters?.length) {
      await Promise.resolve(filtersController.applySaved(filters))
    }

    if (sortBy) {
      pageCommands.setSortBy(sortBy)
      pageCommands.setSortDir(sortDir)
    }
  }

  return {openMediaList}
}
