import {ref, computed, nextTick} from 'vue'
import uniqBy from 'lodash/uniqBy'
import {cloneFilters} from '@/utils/filterClone'
import throttle from 'lodash/throttle'
import {useI18n} from 'vue-i18n'
import {useItemsStore} from '@/stores/items'
import {typedApi} from '@/services/typedApi'
import {scrollMainTo, getMainScrollEl} from '@/utils/mainScroll'
import {
  getDuplicatesGroupKey,
  normalizeSortBy,
} from '@/utils/mediaSortFilter'
import type {
  InfiniteIntersectOptions,
  ItemsPageListQuery,
  ItemsPageLoader,
  MediaListResponse,
  UseItemsPageOptions,
} from '@/types/itemsPage'
import {trimInfiniteScrollItems} from '@shared/listPagination'
import {compensateScrollAfterTopTrim} from '@/utils/infiniteScrollTrim'
import {
  normalizeItemsGroupBy,
  serializeGroupBySetting,
} from '@/utils/itemsGroupBy'

export const INFINITE_PAGE_SIZE = 25

/** Next infinite-scroll page from the current page index (not DOM window size). */
export function getNextInfiniteMediaPage(currentPage: number): number {
  return Math.max(1, Number(currentPage) || 1) + 1
}

export function isAbortError(error: unknown): boolean {
  const err = error as { code?: string; name?: string }
  return err?.code === 'ERR_CANCELED'
    || err?.name === 'CanceledError'
}

export function useItemsPage({
  props,
  mediaType,
  container: _container,
  updatePageSetting,
}: UseItemsPageOptions) {
  const itemsStore = useItemsStore()
  const {t} = useI18n()

  const total = ref(1)
  const totalInDb = ref(0)
  const pages = ref(0)
  const loader = ref<ItemsPageLoader>({
    show: false,
    timeout: 0,
    is_busy: false,
  })
  const isLoadingMore = ref(false)
  const infiniteScrollExhausted = ref(false)
  const scrollRoot = ref<HTMLElement | null>(null)

  let listFetchSeq = 0
  let listAbortController: AbortController | null = null
  let mediaScrollEl: HTMLElement | null = null

  const ITEMS = computed(() => itemsStore)
  const is_infinite_scroll = computed(() => ITEMS.value.limit === 101)
  const showPagination = computed(() => (
    ITEMS.value.itemsOnPage.length > 0 && !is_infinite_scroll.value && pages.value > 0
  ))
  const paginationPage = computed({
    get: () => ITEMS.value.page,
    set: (value: number) => {
      itemsStore.updateState({key: 'page', value})
    },
  })
  const paginationJumpPage = computed({
    get: () => ITEMS.value.jumpPage,
    set: (value: number | null) => {
      itemsStore.updateState({key: 'jumpPage', value})
    },
  })

  const abortPendingListFetch = (): void => {
    listAbortController?.abort()
    listAbortController = null
  }

  const resetMediaListState = (): void => {
    infiniteScrollExhausted.value = false
    itemsStore.updateMultiple({
      itemsOnPage: [],
      entities: [],
      navigationItems: [],
      totalFiltered: 0,
    })
    total.value = 0
    totalInDb.value = 0
    pages.value = 0
  }

  const applyListResponse = (
    response: MediaListResponse,
    {append = false, requestedPage = 1}: {append?: boolean; requestedPage?: number} = {},
  ): boolean => {
    const pageItems = response.data.items || []
    const responseTotalFiltered = response.data.totalFiltered

    if (
      !append
      && pageItems.length === 0
      && responseTotalFiltered != null
      && responseTotalFiltered > 0
      && requestedPage <= 1
    ) {
      return false
    }

    if (response.data.navigation) {
      itemsStore.updateState({
        key: 'navigationItems',
        value: response.data.navigation,
      })
    }

    if (response.data.totalFiltered != null) {
      itemsStore.updateState({
        key: 'totalFiltered',
        value: response.data.totalFiltered,
      })
      total.value = response.data.totalFiltered
    } else if (!append) {
      itemsStore.updateState({
        key: 'totalFiltered',
        value: pageItems.length,
      })
      total.value = pageItems.length
    }

    if (response.data.totalFilesize != null) {
      itemsStore.updateState({
        key: 'totalFilesize',
        value: response.data.totalFilesize || 0,
      })
    }

    if (response.data.total != null) {
      totalInDb.value = response.data.total || 0
    }

    if (response.data.pages != null) {
      pages.value = response.data.pages || 1
    }

    let nextItems = append
      ? uniqBy([...ITEMS.value.itemsOnPage, ...pageItems], 'id')
      : pageItems

    const scrollEl = is_infinite_scroll.value
      ? (getMainScrollEl() as HTMLElement | null)
      : null
    const previousScrollHeight = scrollEl?.scrollHeight ?? 0
    let trimmedFromTop = 0

    if (is_infinite_scroll.value) {
      const trimResult = trimInfiniteScrollItems(nextItems)
      nextItems = trimResult.items
      trimmedFromTop = trimResult.trimmedFromTop
    }

    itemsStore.updateMultiple({
      entities: nextItems,
      itemsOnPage: nextItems,
      isFiltersLoaded: true,
      ...(!append && response.data.groups
        ? {groups: response.data.groups}
        : (!append ? {groups: []} : {})),
    })

    if (trimmedFromTop > 0 && scrollEl) {
      compensateScrollAfterTopTrim(previousScrollHeight)
    }
    return true
  }

  const getItemsFromDb = async (ids?: number[]): Promise<void> => {
    let url = '/api/'
    const query: ItemsPageListQuery = {}

    if (props.items_type === 'tag') {
      url += 'tag/items/'
      query.metaId = props.metaId
    } else if (props.items_type === 'media') {
      url += 'media/items'
      query.mediaTypeId = props.mediaTypeId
    }

    query.filters = cloneFilters(ITEMS.value.filters)
    query.sortBy = normalizeSortBy(
      ITEMS.value.sortBy || 'id',
      props.items_type,
      mediaType.value,
      'createdAt',
      ITEMS.value.safeAssigned,
    ) || 'id'
    query.direction = ITEMS.value.sortDir || 'desc'
    query.find_duplicates = ITEMS.value.find_duplicates || false

    if (props.items_type === 'media') {
      query.duplicates_by = getDuplicatesGroupKey(mediaType.value)
    }

    query.ids = ids || []

    const appendListPage = (props.items_type === 'media' || props.items_type === 'tag')
      && is_infinite_scroll.value
      && ITEMS.value.page > 1
      && ITEMS.value.itemsOnPage.length > 0
      && (!ids || !ids.length)

    if (props.items_type === 'media') {
      query.includeNavigation = false
    }

    if (props.items_type === 'media' || props.items_type === 'tag') {
      const pageLimit = is_infinite_scroll.value ? INFINITE_PAGE_SIZE : ITEMS.value.limit

      if (is_infinite_scroll.value && !appendListPage && (!ids || !ids.length)) {
        itemsStore.updateState({key: 'page', value: 1})
        query.page = 1
      } else {
        query.page = ITEMS.value.page || 1
      }

      query.limit = pageLimit
      query.skipTotals = appendListPage

      const groupBy = ITEMS.value.groupBy
      if (groupBy && groupBy !== 'none') {
        query.groupBy = serializeGroupBySetting(
          normalizeItemsGroupBy(groupBy),
          ITEMS.value.groupByMetaId,
        )
      }
    }

    if (ids && ids.length > 0) {
      query.filters = []
      try {
        const res = await typedApi.postItemsList(url, query)

        for (const id of ids) {
          const item = res.data.items?.find((entry) => Number(entry.id) === Number(id))
          if (item) {
            itemsStore.updateItem({id, item})
          }
        }
      } catch (e) {
        console.error('Error fetching specific items:', e)
      } finally {
        loader.value.is_busy = false
      }
      return
    }

    abortPendingListFetch()
    const requestSeq = ++listFetchSeq
    const abortController = new AbortController()
    listAbortController = abortController

    if (!appendListPage) {
      itemsStore.updateState({key: 'isFiltersLoaded', value: false})
      loader.value.is_busy = true
      loader.value.show = false
    }

    const postListQuery = (payload: ItemsPageListQuery, signal: AbortSignal) =>
      typedApi.postItemsList(url, payload, {signal})

    const finishListResponse = async (
      response: MediaListResponse,
      {
        append = false,
        requestedPage = 1,
      }: {append?: boolean; requestedPage?: number} = {},
    ): Promise<boolean> => {
      if (!append) {
        infiniteScrollExhausted.value = false
      }

      const applied = applyListResponse(response, {append, requestedPage})

      if (
        !applied
        && !append
        && requestedPage === 1
      ) {
        return false
      }

      if (!applied) {
        return false
      }

      if (response.data.page != null) {
        itemsStore.updateState({key: 'page', value: response.data.page})
      }

      if (append && (response.data.items?.length ?? 0) === 0) {
        // Reached the end of the filtered set. Keep totalFiltered from the first page.
        infiniteScrollExhausted.value = true
      } else if (append || is_infinite_scroll.value) {
        await nextTick()
        maybeLoadMoreIfNearBottom()
      }

      return true
    }

    try {
      let response = await postListQuery(query, abortController.signal)

      if (requestSeq !== listFetchSeq) {
        return
      }

      if (!appendListPage) {
        clearTimeout(loader.value.timeout as ReturnType<typeof setTimeout>)
        loader.value.timeout = setTimeout(() => {
          loader.value.show = true
        }, 500)
      }

      if (props.items_type === 'media' || props.items_type === 'tag') {
        let applied = await finishListResponse(response, {
          append: appendListPage,
          requestedPage: query.page,
        })

        if (
          !applied
          && !appendListPage
          && query.page === 1
          && requestSeq === listFetchSeq
        ) {
          query.page = 1
          itemsStore.updateState({key: 'page', value: 1})
          response = await postListQuery(query, abortController.signal)
          if (requestSeq === listFetchSeq) {
            applied = await finishListResponse(response, {
              append: false,
              requestedPage: 1,
            })
          }
        }

        if (!applied && requestSeq === listFetchSeq) {
          return
        }
      }
    } catch (error) {
      if (isAbortError(error) || requestSeq !== listFetchSeq) {
        return
      }

      itemsStore.updateState({key: 'isFiltersLoaded', value: true})

      if (typeof window !== 'undefined' && window.showNotification) {
        window.showNotification(t('notifications_text.server_error_logs'), 'error')
      }

      if (props.items_type === 'media' || props.items_type === 'tag') {
        resetMediaListState()
      }

      throw error
    } finally {
      if (requestSeq === listFetchSeq) {
        loader.value.is_busy = false
      }
    }
  }

  const getEntitiesOnPage = (ids_remove: number[] = []): void => {
    for (const id of ids_remove) {
      itemsStore.removeItem(id)
      totalInDb.value -= 1
    }

    const items = ITEMS.value.entities
    total.value = items.length
    itemsStore.updateState({key: 'totalFiltered', value: items.length})

    const limit = is_infinite_scroll.value ? INFINITE_PAGE_SIZE : ITEMS.value.limit
    const pagesCount = Math.ceil(total.value / limit)
    pages.value = pagesCount

    if (ITEMS.value.page > pagesCount) {
      itemsStore.updateState({key: 'page', value: 1})
    }

    const start = (ITEMS.value.page - 1) * limit
    const end = start + limit
    const new_items_on_page = items.slice(start, end)

    const items_concat = is_infinite_scroll.value
      ? trimInfiniteScrollItems(
        uniqBy([...ITEMS.value.itemsOnPage, ...new_items_on_page], 'id'),
      ).items
      : new_items_on_page

    itemsStore.updateState({key: 'itemsOnPage', value: items_concat})
    itemsStore.updateState({key: 'isFiltersLoaded', value: true})
  }

  const scrollTop = (): void => {
    scrollMainTo({top: 0, behavior: 'smooth'})
  }

  const changePage = (val: number): void => {
    itemsStore.updateState({key: 'page', value: val})
    void updatePageSetting({page: val})

    if (props.items_type === 'media' || props.items_type === 'tag') {
      void getItemsFromDb()
      scrollTop()
      return
    }

    scrollTop()
  }

  const jumpToPage = (value: number | null = ITEMS.value.jumpPage): void => {
    if (value === null || value === undefined) return

    let val = Number(value)
    if (val < 1) val = 1
    else if (val > pages.value) val = pages.value

    if (val !== ITEMS.value.page) {
      itemsStore.updateState({key: 'page', value: val})
    }

    itemsStore.updateState({key: 'jumpPage', value: val})
    changePage(val)
  }

  const refreshScrollRoot = (): HTMLElement | null => {
    scrollRoot.value = getMainScrollEl() as HTMLElement | null
    return scrollRoot.value
  }

  const loadNextInfinitePage = async (): Promise<void> => {
    if (!is_infinite_scroll.value) return
    if (loader.value.is_busy || isLoadingMore.value) return
    if (infiniteScrollExhausted.value) return
    if (ITEMS.value.totalFiltered <= 0) return
    if (ITEMS.value.itemsOnPage.length >= ITEMS.value.totalFiltered) return

    isLoadingMore.value = true
    try {
      itemsStore.updateState({
        key: 'page',
        value: getNextInfiniteMediaPage(ITEMS.value.page),
      })
      await getItemsFromDb()
    } finally {
      isLoadingMore.value = false
    }
  }

  const maybeLoadMoreIfNearBottom = (): void => {
    if (!is_infinite_scroll.value) return
    if (loader.value.is_busy || isLoadingMore.value) return
    if (infiniteScrollExhausted.value) return
    if (ITEMS.value.totalFiltered <= 0) return
    if (ITEMS.value.itemsOnPage.length >= ITEMS.value.totalFiltered) return

    const el = refreshScrollRoot() || getMainScrollEl()
    if (!el) return

    const threshold = 400
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold
    const shortPage = el.scrollHeight <= el.clientHeight + threshold
    const loadedEnoughToFillViewport = ITEMS.value.itemsOnPage.length >= INFINITE_PAGE_SIZE

    if (shortPage && loadedEnoughToFillViewport) {
      return
    }

    if (nearBottom || shortPage) {
      void loadNextInfinitePage()
    }
  }

  const infiniteScrolling = (isIntersecting: boolean): void => {
    if (isIntersecting === false) return
    void loadNextInfinitePage()
  }

  const infiniteIntersectOptions = computed((): InfiniteIntersectOptions => ({
    handler: infiniteScrolling,
    options: {
      root: scrollRoot.value,
      rootMargin: '400px 0px',
      threshold: 0,
    },
  }))

  const onInfiniteScroll = throttle(() => {
    if (!is_infinite_scroll.value) return
    const el = getMainScrollEl()
    if (!el) return

    const threshold = 400
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold
    if (nearBottom) void loadNextInfinitePage()
  }, 150)

  const bindMediaInfiniteScroll = (): void => {
    unbindMediaInfiniteScroll()
    if (!is_infinite_scroll.value) return
    mediaScrollEl = refreshScrollRoot() as HTMLElement | null
    mediaScrollEl?.addEventListener('scroll', onInfiniteScroll, {passive: true})
  }

  const unbindMediaInfiniteScroll = (): void => {
    if (mediaScrollEl) {
      mediaScrollEl.removeEventListener('scroll', onInfiniteScroll)
      mediaScrollEl = null
    }
    onInfiniteScroll.cancel()
  }

  const disposeListFetching = (): void => {
    abortPendingListFetch()
    listFetchSeq += 1
  }

  return {
    total,
    totalInDb,
    pages,
    loader,
    isLoadingMore,
    infiniteScrollExhausted,
    scrollRoot,
    is_infinite_scroll,
    showPagination,
    paginationPage,
    paginationJumpPage,
    infiniteIntersectOptions,
    getItemsFromDb,
    getEntitiesOnPage,
    changePage,
    jumpToPage,
    scrollTop,
    resetMediaListState,
    abortPendingListFetch,
    disposeListFetching,
    bindMediaInfiniteScroll,
    unbindMediaInfiniteScroll,
    maybeLoadMoreIfNearBottom,
    refreshScrollRoot,
    loadNextInfinitePage,
  }
}
