import {nextTick} from 'vue'
import {useRouter, useRoute} from 'vue-router'
import {useItemsStore} from '@/stores/items'
import {useItemsPageCommands} from '@/composable/itemsPageCommands'
import {useItemsFiltersController} from '@/composable/itemsFiltersController'
import {getDefaultMediaTypeId} from '@/utils/mediaType'
import {useAppStore} from '@/stores/app'
import type {FilterObject} from '@/types/common'

export type MediaListScopeKind = 'semantic' | 'visualSimilar' | 'clipSimilar' | 'fromPlayer'

export type MediaListScope = {
  kind: MediaListScopeKind
  /** Optional display text (e.g. semantic query). */
  label?: string
}

interface OpenMediaListOptions {
  sortBy?: string
  sortDir?: string
  mediaTypeId?: number
  filters?: FilterObject[]
  /** Scope the media list to these ids (ranked order preserved). */
  ids?: number[]
  /** Label/kind for the scope chip when `ids` are set. */
  scope?: MediaListScope | null
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
    ids,
    scope = null,
  }: OpenMediaListOptions = {}) => {
    const targetMediaTypeId = mediaTypeId ?? getDefaultMediaTypeId(appStore.mediaTypes)
    const alreadyOnPage =
      route.path === '/media'
      && Number(route.query.mediaTypeId) === Number(targetMediaTypeId)

    if (!alreadyOnPage) {
      await router.push(`/media?mediaTypeId=${targetMediaTypeId}`)
      await waitForMediaPageReady()
    }

    if (ids?.length) {
      itemsStore.find_duplicates = false
      itemsStore.duplicates_by = null
      itemsStore.listScopeIds = ids.map(Number).filter((id) => Number.isFinite(id) && id > 0)
      itemsStore.listScope = scope
        ? {kind: scope.kind, ...(scope.label ? {label: scope.label} : {})}
        : {kind: 'visualSimilar'}
    } else if (filters?.length) {
      // Home View-all / filter navigation should leave More-like-this scope.
      itemsStore.listScopeIds = null
      itemsStore.listScope = null
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

    if (ids?.length) {
      itemsStore.updateState({key: 'page', value: 1})
      await Promise.resolve(pageCommands.reloadItems())
    }
  }

  return {openMediaList}
}
