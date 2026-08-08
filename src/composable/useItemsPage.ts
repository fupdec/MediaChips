import {ref, computed, nextTick} from 'vue'
import uniqBy from 'lodash/uniqBy'
import {cloneFilters} from '@/utils/filterClone'
import {useI18n} from 'vue-i18n'
import {useItemsStore} from '@/stores/items'
import {typedApi} from '@/services/typedApi'
import {scrollMainTo, getMainScrollEl} from '@/utils/mainScroll'
import {getLayoutTopInScroll} from '@/utils/gridLayout'
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
import {
  trimInfiniteScrollItems,
  resolvePageLimit,
  getInfiniteJumpWindowStart,
  INFINITE_SCROLL_PAGE_SIZE,
  INFINITE_SCROLL_MAX_ITEMS,
} from '@shared/listPagination'
import {
  normalizeItemsGroupBy,
  serializeGroupBySetting,
} from '@/utils/itemsGroupBy'
import {orderItemsByIds} from '@/utils/orderItemsByIds'
import {clearHoverPreviewUnavailableCache} from '@/utils/hoverPreviewUnavailableCache'
import {pruneMediaThumbCaches} from '@/utils/thumbDisplayCache'
import {getMediaDeleteAssetFolder} from '@/utils/mediaType'

export const INFINITE_PAGE_SIZE = INFINITE_SCROLL_PAGE_SIZE

/** Gap after a page finishes before another may start (not from request start). */
export const INFINITE_LOAD_COOLDOWN_MS = 200

/** Auto-fill only when the first pages don't cover the viewport. */
export const INFINITE_SHORT_VIEWPORT_FILL_MAX = 3

/** How far past the loaded window (in items) before we jump instead of appending. */
export const INFINITE_JUMP_AHEAD_PAGES = 3

/** Debounce scrollbar seeks before replacing the data window. */
export const INFINITE_JUMP_DEBOUNCE_MS = 120

/** After a far seek, block jump/append/recover while natural rows settle. */
export const INFINITE_SEEK_LOCK_MS = 1100

/** Start appending when this many items remain before the loaded end. */
const INFINITE_PREFETCH_REMAINING_ITEMS = INFINITE_PAGE_SIZE * 2

/** Next infinite-scroll page from the current page index (not DOM window size). */
export function getNextInfiniteMediaPage(currentPage: number): number {
  return Math.max(1, Number(currentPage) || 1) + 1
}

export function getInfinitePageForIndex(
  index: number,
  pageSize: number = INFINITE_PAGE_SIZE,
): number {
  const size = Math.max(1, pageSize)
  return Math.floor(Math.max(0, Number(index) || 0) / size) + 1
}

/** True when the scroll target is outside the loaded window far enough to replace. */
export function shouldJumpInfiniteWindow(
  targetIndex: number,
  windowStart: number,
  loadedCount: number,
  pageSize: number = INFINITE_PAGE_SIZE,
): boolean {
  const start = Math.max(0, windowStart)
  const end = start + Math.max(0, loadedCount)
  const target = Math.max(0, targetIndex)
  if (target < start) return true
  if (target >= end + pageSize * INFINITE_JUMP_AHEAD_PAGES) return true
  return false
}

/**
 * Map a viewport focus offset inside the virtual grid to an absolute item index.
 * Inside/near the loaded block use spatial bounds (trim / short seeks).
 * Far into the phantom head/tail use the global height ratio — local stride
 * extrapolation from a small measured window cascades wrong jumps.
 */
export function resolveVirtualScrollTargetIndex(input: {
  focusY: number
  columnCount: number
  rowHeight?: number
  totalHeight?: number
  totalCount?: number
  dataStartTop?: number
  dataEndTop?: number
  windowStart?: number
  loadedCount?: number
}): number | null {
  const columnCount = Math.max(0, Math.floor(Number(input.columnCount) || 0))
  if (columnCount <= 0) return null

  const focusY = Math.max(0, Number(input.focusY) || 0)
  const totalHeight = Math.max(0, Number(input.totalHeight) || 0)
  const totalCount = Math.max(0, Math.floor(Number(input.totalCount) || 0))
  const windowStart = Math.max(0, Math.floor(Number(input.windowStart) || 0))
  const loadedCount = Math.max(0, Math.floor(Number(input.loadedCount) || 0))
  const dataStartTop = Math.max(0, Number(input.dataStartTop) || 0)
  const dataEndTop = Math.max(0, Number(input.dataEndTop) || 0)
  const rowHeight = Math.max(0, Number(input.rowHeight) || 0)
  const clampIndex = (index: number) => {
    if (totalCount > 0) return Math.min(totalCount - 1, Math.max(0, index))
    return Math.max(0, index)
  }

  const ratioIndex = () => {
    if (totalHeight <= 0 || totalCount <= 0) return null
    const ratio = Math.min(1, focusY / totalHeight)
    return clampIndex(Math.floor(ratio * totalCount))
  }

  if (loadedCount > 0 && dataEndTop > dataStartTop + 1) {
    const loadedRows = Math.max(1, Math.ceil(loadedCount / columnCount))
    const localStride = Math.max(1, (dataEndTop - dataStartTop) / loadedRows)
    const stride = rowHeight > 0 ? rowHeight : localStride
    // ~one loaded window of padding — beyond that, trust the scrollbar ratio.
    const nearPad = Math.max(stride * loadedRows, stride * 8, 2_000)

    if (focusY < dataStartTop - nearPad || focusY >= dataEndTop + nearPad) {
      return ratioIndex()
    }

    if (focusY < dataStartTop - 2) {
      const rowsAbove = Math.max(1, Math.ceil((dataStartTop - focusY) / stride))
      return clampIndex(windowStart - rowsAbove * columnCount)
    }

    if (focusY >= dataEndTop - 2) {
      const rowsBelow = Math.max(0, Math.floor((focusY - dataEndTop) / stride))
      return clampIndex(windowStart + loadedCount + rowsBelow * columnCount)
    }

    const localRatio = (focusY - dataStartTop) / (dataEndTop - dataStartTop)
    return clampIndex(windowStart + Math.floor(localRatio * loadedCount))
  }

  const fromRatio = ratioIndex()
  if (fromRatio != null) return fromRatio

  if (rowHeight <= 0) return null
  const row = Math.max(0, Math.floor(focusY / rowHeight))
  return clampIndex(row * columnCount)
}

/**
 * Heal only when the viewport sits inside the loaded block but rows failed to
 * mount. Phantom head/tail must NOT snap back — that is a scrollbar seek.
 */
export function shouldRecoverEmptyViewport(input: {
  focusY: number
  dataStartTop: number
  dataEndTop: number
  rowCount: number
  padPx?: number
}): boolean {
  const pad = Number.isFinite(input.padPx) ? Math.max(0, Number(input.padPx)) : 32
  const dataStart = Math.max(0, Number(input.dataStartTop) || 0)
  const dataEnd = Math.max(0, Number(input.dataEndTop) || 0)
  if (dataEnd <= dataStart + 1) return false
  if (input.rowCount > 0) return false
  const focusY = Number(input.focusY) || 0
  return focusY >= dataStart - pad && focusY < dataEnd - pad
}

/** Scroll so `index` sits near the top of the viewport (global ratio geometry). */
export function resolveScrollTopForIndex(input: {
  index: number
  layoutTop: number
  totalHeight: number
  totalCount: number
  rowHeight?: number
  columnCount?: number
}): number {
  const index = Math.max(0, Math.floor(Number(input.index) || 0))
  const layoutTop = Math.max(0, Number(input.layoutTop) || 0)
  const totalHeight = Math.max(0, Number(input.totalHeight) || 0)
  const totalCount = Math.max(0, Math.floor(Number(input.totalCount) || 0))

  if (totalHeight > 0 && totalCount > 0) {
    const ratio = Math.min(1, index / totalCount)
    return Math.max(0, layoutTop + ratio * totalHeight)
  }

  const columnCount = Math.max(1, Math.floor(Number(input.columnCount) || 1))
  const rowHeight = Math.max(1, Number(input.rowHeight) || 320)
  return Math.max(0, layoutTop + Math.floor(index / columnCount) * rowHeight)
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
  /** True while a follow-up page is scheduled (shows spinner during cooldown). */
  const infiniteLoadPending = ref(false)
  /** How many items were trimmed from the top of the infinite window (for range spacers). */
  const infiniteWindowStart = ref(0)

  let listFetchSeq = 0
  let listAbortController: AbortController | null = null
  let mediaScrollEl: HTMLElement | null = null
  let lastInfiniteLoadEndedAt = 0
  let shortViewportFillCount = 0
  let pendingFillTimer: ReturnType<typeof setTimeout> | null = null
  let pendingUserLoadTimer: ReturnType<typeof setTimeout> | null = null
  let pendingJumpTimer: ReturnType<typeof setTimeout> | null = null
  let scrollLoadRaf: number | null = null
  let isInfiniteJumping = false
  /** After a far seek, ignore jump/append/sentinel while geometry settles. */
  let seekLockUntil = 0

  const isSeekLocked = (): boolean => (
    isInfiniteJumping || Date.now() < seekLockUntil
  )

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
    infiniteWindowStart.value = 0
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
    {
      append = false,
      requestedPage = 1,
      absoluteWindowStart,
    }: {
      append?: boolean
      requestedPage?: number
      /** When replacing via scrollbar jump, keep absolute indices aligned. */
      absoluteWindowStart?: number
    } = {},
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
      // Jump/replace with skipTotals omits totals — never shrink an existing filtered count
      // down to the page size (that falsely marks the list as exhausted).
      const previousFiltered = Number(ITEMS.value.totalFiltered) || 0
      if (previousFiltered <= 0) {
        itemsStore.updateState({
          key: 'totalFiltered',
          value: pageItems.length,
        })
        total.value = pageItems.length
      }
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

    // ID-scoped lists (semantic / more-like-this) only fetch one page of ids from the
    // API, so override totals from the full ranked scope kept on the store.
    const scopeIdsForTotals = ITEMS.value.listScopeIds
    if (
      props.items_type === 'media'
      && Array.isArray(scopeIdsForTotals)
      && scopeIdsForTotals.length > 0
    ) {
      const scopeTotal = scopeIdsForTotals.length
      const scopePageLimit = resolvePageLimit(
        is_infinite_scroll.value ? INFINITE_PAGE_SIZE : ITEMS.value.limit,
      ) || scopeTotal
      itemsStore.updateState({key: 'totalFiltered', value: scopeTotal})
      total.value = scopeTotal
      pages.value = Math.max(1, Math.ceil(scopeTotal / scopePageLimit))
    }

    let nextItems = append
      ? uniqBy([...ITEMS.value.itemsOnPage, ...pageItems], 'id')
      : pageItems

    const previousWindowIds = (!append || is_infinite_scroll.value)
      ? ITEMS.value.itemsOnPage.map((item) => item.id)
      : []

    // Fresh grid (filters/sort/page replace) — allow hover to re-probe availability.
    if (!append) {
      clearHoverPreviewUnavailableCache()
      infiniteWindowStart.value = Math.max(0, Number(absoluteWindowStart) || 0)
    }

    const scopeIds = ITEMS.value.listScopeIds
    if (
      props.items_type === 'media'
      && Array.isArray(scopeIds)
      && scopeIds.length > 0
    ) {
      nextItems = orderItemsByIds(nextItems, scopeIds)
    }

    if (is_infinite_scroll.value) {
      const trimResult = trimInfiniteScrollItems(nextItems)
      nextItems = trimResult.items
      if (trimResult.trimmedFromTop > 0) {
        // Keep scroll height via top range spacer instead of scrollTop surgery.
        infiniteWindowStart.value += trimResult.trimmedFromTop
      }

      const keptIds = new Set(nextItems.map((item) => Number(item.id)))
      const droppedIds = previousWindowIds.filter((id) => !keptIds.has(Number(id)))
      if (droppedIds.length && props.items_type === 'media') {
        const folder = getMediaDeleteAssetFolder(mediaType.value) || 'videos'
        pruneMediaThumbCaches(droppedIds, folder)
        itemsStore.pruneThumbKeys(droppedIds)
      }
    }

    itemsStore.updateMultiple({
      entities: nextItems,
      itemsOnPage: nextItems,
      isFiltersLoaded: true,
      ...(!append && response.data.groups
        ? {groups: response.data.groups}
        : (!append ? {groups: []} : {})),
    })

    return true
  }

  const getItemsFromDb = async (
    ids?: number[],
    options: {
      infiniteJumpPage?: number
      infiniteJumpLimit?: number
      absoluteWindowStart?: number
    } = {},
  ): Promise<void> => {
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
      query.duplicates_by = getDuplicatesGroupKey(mediaType.value, ITEMS.value.duplicates_by)
    }

    // Explicit `ids` arg = card refresh path. Full list uses listScopeIds when set.
    // For scoped lists, only request the current page of ids so we do not hydrate
    // hundreds of Item trees at once (main post-semantic-search perf cost).
    const explicitIds = (ids && ids.length > 0) ? ids : null
    const scopeIds = (!explicitIds && ITEMS.value.listScopeIds?.length)
      ? ITEMS.value.listScopeIds
      : null

    const jumpPage = Math.max(1, Math.floor(Number(options.infiniteJumpPage) || 0))
    const jumpLimit = Math.max(
      INFINITE_PAGE_SIZE,
      Math.floor(Number(options.infiniteJumpLimit) || 0) || INFINITE_PAGE_SIZE,
    )
    const jumpWindowStart = Math.max(0, Math.floor(Number(options.absoluteWindowStart) || 0))
    const isInfiniteJump = Boolean(
      options.infiniteJumpPage
      && jumpPage >= 1
      && is_infinite_scroll.value
      && !explicitIds
      && (props.items_type === 'media' || props.items_type === 'tag'),
    )

    const appendListPage = (props.items_type === 'media' || props.items_type === 'tag')
      && is_infinite_scroll.value
      && ITEMS.value.page > 1
      && ITEMS.value.itemsOnPage.length > 0
      && !explicitIds
      && !isInfiniteJump

    if (!appendListPage) {
      shortViewportFillCount = 0
      lastInfiniteLoadEndedAt = 0
      infiniteLoadPending.value = false
      if (pendingUserLoadTimer) {
        clearTimeout(pendingUserLoadTimer)
        pendingUserLoadTimer = null
      }
    }
    if (props.items_type === 'media') {
      query.includeNavigation = false
    }

    if (props.items_type === 'media' || props.items_type === 'tag') {
      const pageLimit = is_infinite_scroll.value ? INFINITE_PAGE_SIZE : ITEMS.value.limit

      if (isInfiniteJump) {
        query.page = jumpPage
        query.limit = jumpLimit
        // Store page in 40-item units so sequential append continues after the window.
        itemsStore.updateState({
          key: 'page',
          value: getInfinitePageForIndex(jumpWindowStart + jumpLimit - 1),
        })
      } else if (is_infinite_scroll.value && !appendListPage && !explicitIds) {
        itemsStore.updateState({key: 'page', value: 1})
        query.page = 1
        query.limit = pageLimit
      } else {
        query.page = ITEMS.value.page || 1
        query.limit = pageLimit
      }

      query.skipTotals = appendListPage || (isInfiniteJump && ITEMS.value.totalFiltered > 0)

      if (props.items_type === 'tag' && ITEMS.value.namePrefix) {
        query.namePrefix = ITEMS.value.namePrefix
      }
      if (props.items_type === 'tag' && ITEMS.value.colorFilter) {
        query.colorFilter = ITEMS.value.colorFilter
      }

      const groupBy = ITEMS.value.groupBy
      if (groupBy && groupBy !== 'none') {
        query.groupBy = serializeGroupBySetting(
          normalizeItemsGroupBy(groupBy),
          ITEMS.value.groupByMetaId,
        )
      }
    }

    if (explicitIds) {
      query.ids = explicitIds
    } else if (scopeIds) {
      const pageLimit = resolvePageLimit(
        Number(query.limit) || (is_infinite_scroll.value ? INFINITE_PAGE_SIZE : ITEMS.value.limit),
      )
      const page = Math.max(1, Number(query.page) || 1)
      if (pageLimit) {
        const start = (page - 1) * pageLimit
        query.ids = scopeIds.slice(start, start + pageLimit)
      } else {
        query.ids = [...scopeIds]
      }
      // Empty page of a scope must not fall through to an unscoped library fetch.
      if (!query.ids.length) {
        const scopeTotal = scopeIds.length
        const scopePageLimit = pageLimit || scopeTotal || 1
        if (!appendListPage) {
          clearHoverPreviewUnavailableCache()
        }
        itemsStore.updateMultiple({
          entities: appendListPage ? ITEMS.value.itemsOnPage : [],
          itemsOnPage: appendListPage ? ITEMS.value.itemsOnPage : [],
          isFiltersLoaded: true,
          totalFiltered: scopeTotal,
          ...(!appendListPage ? {groups: []} : {}),
        })
        total.value = scopeTotal
        pages.value = Math.max(1, Math.ceil(scopeTotal / scopePageLimit))
        if (appendListPage) {
          infiniteScrollExhausted.value = true
        }
        loader.value.is_busy = false
        return
      }
    } else {
      query.ids = []
    }

    if (explicitIds) {
      // Refresh card payloads only — never recompute/cache library totals.
      query.skipTotals = true
      try {
        const res = await typedApi.postItemsList(url, query)

        for (const id of explicitIds) {
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

    if (!appendListPage && !isInfiniteJump) {
      itemsStore.updateState({key: 'isFiltersLoaded', value: false})
      loader.value.is_busy = true
      loader.value.show = false
    } else if (isInfiniteJump) {
      // Keep the grid mounted; only the bottom/slot spinner should show.
      loader.value.is_busy = true
    }

    const postListQuery = (payload: ItemsPageListQuery, signal: AbortSignal) =>
      typedApi.postItemsList(url, payload, {signal})

    const finishListResponse = async (
      response: MediaListResponse,
      {
        append = false,
        requestedPage = 1,
        absoluteWindowStart,
      }: {
        append?: boolean
        requestedPage?: number
        absoluteWindowStart?: number
      } = {},
    ): Promise<boolean> => {
      // Empty seek must not wipe the currently mounted window.
      if (
        isInfiniteJump
        && !append
        && (response.data.items?.length ?? 0) === 0
      ) {
        infiniteScrollExhausted.value = true
        return true
      }

      if (!append) {
        infiniteScrollExhausted.value = false
      }

      const applied = applyListResponse(response, {append, requestedPage, absoluteWindowStart})

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

      if (ITEMS.value.listScopeIds?.length) {
        // Backend disables SQL pagination when `ids` are set and always reports page=1.
        // Keep the client page so infinite-scroll / pager can advance through the scope.
        itemsStore.updateState({key: 'page', value: requestedPage})
      } else if (append) {
        // Keep the page advanced by loadNextInfinitePage; response page can lag.
      } else if (isInfiniteJump) {
        // Page already set to the end of the fat jump window (40-item units).
        const loaded = ITEMS.value.itemsOnPage.length
        if (loaded > 0) {
          itemsStore.updateState({
            key: 'page',
            value: getInfinitePageForIndex(infiniteWindowStart.value + loaded - 1),
          })
        }
      } else if (response.data.page != null) {
        itemsStore.updateState({key: 'page', value: response.data.page})
      }

      if (append && (response.data.items?.length ?? 0) === 0) {
        // Reached the end of the filtered set. Keep totalFiltered from the first page.
        infiniteScrollExhausted.value = true
      } else if (
        append
        && ITEMS.value.listScopeIds?.length
        && ITEMS.value.itemsOnPage.length >= ITEMS.value.totalFiltered
      ) {
        infiniteScrollExhausted.value = true
      } else if (
        !isInfiniteJump
        && !isInfiniteJumping
        && (append || is_infinite_scroll.value)
      ) {
        // Fill short viewports only — never while a scrollbar jump is filling.
        scheduleShortViewportFill()
      }

      return true
    }

    try {
      let response = await postListQuery(query, abortController.signal)

      if (requestSeq !== listFetchSeq) {
        return
      }

      if (!appendListPage && !isInfiniteJump) {
        clearTimeout(loader.value.timeout as ReturnType<typeof setTimeout>)
        loader.value.timeout = setTimeout(() => {
          loader.value.show = true
        }, 500)
      }

      if (props.items_type === 'media' || props.items_type === 'tag') {
        let applied = await finishListResponse(response, {
          append: appendListPage,
          requestedPage: query.page,
          ...(isInfiniteJump
            ? {
              absoluteWindowStart: options.absoluteWindowStart != null
                ? jumpWindowStart
                : (jumpPage - 1) * jumpLimit,
            }
            : {}),
        })

        if (
          !applied
          && !appendListPage
          && !isInfiniteJump
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

      // Never wipe a painted grid. 1.6.1 only preserved append failures; a failed
      // full refresh after the first page (or when appendListPage was false due to
      // a race) still cleared items → “Nothing here yet / add files” while Home
      // counts stayed correct.
      if (props.items_type === 'media' || props.items_type === 'tag') {
        if (ITEMS.value.itemsOnPage.length > 0) {
          if (appendListPage) {
            itemsStore.updateState({
              key: 'page',
              value: Math.max(1, Number(ITEMS.value.page || 1) - 1),
            })
          }
          infiniteScrollExhausted.value = false
        } else if (!appendListPage) {
          resetMediaListState()
        }
      }

      // Handled above — do not rethrow or callers/fill loops may cascade reloads.
    } finally {
      if (requestSeq === listFetchSeq) {
        loader.value.is_busy = false
        // Active request must never leave filters/toolbar overlays spinning after it ends
        // (empty-page retry failure, non-list item types, etc.). Superseded requests skip this.
        if (!itemsStore.isFiltersLoaded) {
          itemsStore.updateState({key: 'isFiltersLoaded', value: true})
        }
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

    const items_concat_result = is_infinite_scroll.value
      ? trimInfiniteScrollItems(
        uniqBy([...ITEMS.value.itemsOnPage, ...new_items_on_page], 'id'),
      )
      : {items: new_items_on_page, trimmedFromTop: 0}

    if (items_concat_result.trimmedFromTop > 0) {
      infiniteWindowStart.value += items_concat_result.trimmedFromTop
    }

    itemsStore.updateState({key: 'itemsOnPage', value: items_concat_result.items})
    itemsStore.updateState({key: 'isFiltersLoaded', value: true})
  }

  let scrollTopToListStart: () => void = () => {
    scrollMainTo({top: 0, behavior: 'smooth'})
  }

  const changePage = (val: number): void => {
    itemsStore.updateState({key: 'page', value: val})
    void updatePageSetting({page: val})

    if (props.items_type === 'media' || props.items_type === 'tag') {
      void getItemsFromDb()
      scrollTopToListStart()
      return
    }

    scrollTopToListStart()
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

  const getInfiniteContentBottom = (el: HTMLElement): number => {
    if (typeof document === 'undefined') return el.scrollHeight

    // Virtual grid: load-more at end of loaded data, not filtered phantom tail.
    const dataEnd = document.querySelector('.virtual-grid-data-end') as HTMLElement | null
    if (dataEnd) {
      const elRect = el.getBoundingClientRect()
      const endRect = dataEnd.getBoundingClientRect()
      return Math.max(0, el.scrollTop + (endRect.top - elRect.top) + dataEnd.offsetHeight)
    }

    const filteredTail = document.querySelector('.virtual-grid-spacer--tail') as HTMLElement | null
    const bottomPx = filteredTail?.offsetHeight ?? 0
    return Math.max(0, el.scrollHeight - bottomPx)
  }

  const isNearBottom = (el: HTMLElement, threshold = 240): boolean => {
    return el.scrollTop + el.clientHeight >= getInfiniteContentBottom(el) - threshold
  }

  const getVirtualScrollTargetIndex = (el: HTMLElement): number | null => {
    const layoutEl = document.querySelector('.items-virtual-grid') as HTMLElement | null
    if (!layoutEl) return null
    const layoutTop = getLayoutTopInScroll(layoutEl, el)
    // Use the top of the viewport so upward seeks into the trimmed head are detected
    // even when a few loaded rows still peek at the bottom of the screen.
    const focusY = el.scrollTop + 8 - layoutTop
    return resolveVirtualScrollTargetIndex({
      focusY,
      columnCount: Number(layoutEl.dataset.columnCount) || 0,
      rowHeight: Number(layoutEl.dataset.rowHeight) || 0,
      totalHeight: Number(layoutEl.dataset.totalHeight) || 0,
      totalCount: Number(layoutEl.dataset.totalCount) || 0,
      dataStartTop: Number(layoutEl.dataset.startTop) || 0,
      dataEndTop: Number(layoutEl.dataset.endTop) || 0,
      windowStart: Number(layoutEl.dataset.windowStart) || 0,
      loadedCount: Number(layoutEl.dataset.loadedCount) || 0,
    })
  }

  const clearPendingJump = (): void => {
    if (pendingJumpTimer) {
      clearTimeout(pendingJumpTimer)
      pendingJumpTimer = null
    }
  }

  const clearPendingUserLoad = (): void => {
    if (pendingUserLoadTimer) {
      clearTimeout(pendingUserLoadTimer)
      pendingUserLoadTimer = null
    }
    infiniteLoadPending.value = false
  }

  const armSeekLock = (): void => {
    seekLockUntil = Date.now() + INFINITE_SEEK_LOCK_MS
    clearPendingUserLoad()
    clearPendingJump()
  }

  const scrollViewportToAbsoluteIndex = (
    index: number,
    options: {pinWindowTop?: boolean} = {},
  ): void => {
    const el = getMainScrollEl() as HTMLElement | null
    const layoutEl = typeof document !== 'undefined'
      ? document.querySelector('.items-virtual-grid') as HTMLElement | null
      : null
    if (!el || !layoutEl) return

    const layoutTop = getLayoutTopInScroll(layoutEl, el)
    const windowStart = infiniteWindowStart.value
    const loadedCount = ITEMS.value.itemsOnPage.length
    const totalCount = Math.max(
      1,
      ITEMS.value.totalFiltered || Number(layoutEl.dataset.totalCount) || 1,
    )
    const totalHeight = Number(layoutEl.dataset.totalHeight) || 0
    const dataStartTop = Number(layoutEl.dataset.startTop) || 0
    const dataEndTop = Number(layoutEl.dataset.endTop) || 0
    const rowHeight = Number(layoutEl.dataset.rowHeight) || 320
    const columnCount = Math.max(1, Number(layoutEl.dataset.columnCount) || 1)

    // Far seeks: pin to the top of the loaded window. Mid-window ratio pins drift
    // as natural card rows measure in and change totalHeight.
    const pinIndex = options.pinWindowTop || loadedCount <= 0
      ? windowStart
      : Math.min(Math.max(index, windowStart), windowStart + loadedCount - 1)

    let y: number
    if (loadedCount > 0 && dataEndTop > dataStartTop + 1) {
      if (options.pinWindowTop || pinIndex <= windowStart) {
        y = dataStartTop
      } else {
        const local = (pinIndex - windowStart) / Math.max(1, loadedCount - 1)
        y = dataStartTop + local * (dataEndTop - dataStartTop)
      }
    } else if (totalHeight > 0) {
      y = (pinIndex / totalCount) * totalHeight
    } else {
      y = Math.floor(pinIndex / columnCount) * rowHeight
    }

    scrollMainTo({top: Math.max(0, layoutTop + y), behavior: 'auto'})
  }

  /** If the viewport is blank after a seek, pull scroll back onto loaded cards. */
  const recoverEmptyViewport = (): boolean => {
    const el = getMainScrollEl() as HTMLElement | null
    const layoutEl = typeof document !== 'undefined'
      ? document.querySelector('.items-virtual-grid') as HTMLElement | null
      : null
    if (!el || !layoutEl || ITEMS.value.itemsOnPage.length <= 0) return false

    const layoutTop = getLayoutTopInScroll(layoutEl, el)
    const focusY = el.scrollTop + 8 - layoutTop
    const shouldRecover = shouldRecoverEmptyViewport({
      focusY,
      dataStartTop: Number(layoutEl.dataset.startTop) || 0,
      dataEndTop: Number(layoutEl.dataset.endTop) || 0,
      rowCount: layoutEl.querySelectorAll('.virtual-grid-row').length,
    })
    if (!shouldRecover) return false

    scrollViewportToAbsoluteIndex(infiniteWindowStart.value)
    return true
  }

  const waitForPaint = (): Promise<void> => new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })

  const jumpInfiniteToPage = async (
    page: number,
    options: {pinScrollTop?: boolean; seekIndex?: number} = {},
  ): Promise<void> => {
    if (!is_infinite_scroll.value) return
    if (loader.value.is_busy || isLoadingMore.value || isInfiniteJumping) return
    if (ITEMS.value.totalFiltered <= 0) return

    const totalCount = ITEMS.value.totalFiltered
    const loadedStart = infiniteWindowStart.value
    const loadedEnd = loadedStart + ITEMS.value.itemsOnPage.length
    const seekIndex = options.seekIndex != null
      ? Math.min(
        Math.max(0, Math.floor(options.seekIndex)),
        Math.max(0, totalCount - 1),
      )
      : Math.min(
        Math.max(0, (Math.max(1, page) - 1) * INFINITE_PAGE_SIZE),
        Math.max(0, totalCount - 1),
      )
    const isFarSeek = options.seekIndex != null

    // Target already inside the mounted window — just pin, no refetch.
    if (
      ITEMS.value.itemsOnPage.length > 0
      && seekIndex >= loadedStart
      && seekIndex < loadedEnd
    ) {
      if (options.pinScrollTop) scrollMainTo({top: 0, behavior: 'auto'})
      else {
        scrollViewportToAbsoluteIndex(seekIndex)
        armSeekLock()
      }
      return
    }

    const jumpLimit = INFINITE_SCROLL_MAX_ITEMS
    const absoluteWindowStart = getInfiniteJumpWindowStart({
      seekIndex,
      totalCount,
      currentWindowStart: loadedStart,
      windowSize: jumpLimit,
      pageSize: jumpLimit,
    })
    const jumpPage = Math.floor(absoluteWindowStart / jumpLimit) + 1

    // Seeking to an earlier/later page — allow loads again after a previous EOF.
    infiniteScrollExhausted.value = false

    isInfiniteJumping = true
    infiniteLoadPending.value = true
    isLoadingMore.value = true
    clearPendingUserLoad()
    clearPendingJump()
    if (isFarSeek) armSeekLock()
    try {
      // One fat fetch — no append cascade (that remounted the grid 4× and jerked).
      await getItemsFromDb(undefined, {
        infiniteJumpPage: jumpPage,
        infiniteJumpLimit: jumpLimit,
        absoluteWindowStart,
      })
    } finally {
      isInfiniteJumping = false
      isLoadingMore.value = false
      infiniteLoadPending.value = false
      // Far seeks must not unlock append bursts — that cascades "extra pages".
      if (!isFarSeek) lastInfiniteLoadEndedAt = 0
      else lastInfiniteLoadEndedAt = Date.now()
    }

    await nextTick()
    if (options.pinScrollTop) {
      scrollMainTo({top: 0, behavior: 'auto'})
      return
    }

    // One jump + one pin to the top of the loaded window after layout commits.
    armSeekLock()
    await nextTick()
    await waitForPaint()
    scrollViewportToAbsoluteIndex(seekIndex, {pinWindowTop: true})
    armSeekLock()
  }

  /** Scroll to list top; reload page 1 when the infinite window was trimmed. */
  scrollTopToListStart = (): void => {
    if (is_infinite_scroll.value && infiniteWindowStart.value > 0) {
      void jumpInfiniteToPage(1, {pinScrollTop: true})
      return
    }
    scrollMainTo({top: 0, behavior: 'smooth'})
  }

  const ensureInfiniteCoversScroll = (): void => {
    if (!is_infinite_scroll.value) return
    if (loader.value.is_busy || isLoadingMore.value || isInfiniteJumping) return
    if (ITEMS.value.totalFiltered <= 0) return

    const el = getMainScrollEl() as HTMLElement | null
    if (!el) return

    // While seek-locked, let natural-row measure settle — recover/jump cascades
    // are what made the grid "drive itself" after far scrollbar seeks.
    if (isSeekLocked()) return

    if (recoverEmptyViewport()) return

    const targetIndex = getVirtualScrollTargetIndex(el)
    if (targetIndex == null) {
      if (!infiniteScrollExhausted.value && isNearBottom(el, 400)) {
        void loadNextInfinitePage('user')
      }
      return
    }

    const windowStart = infiniteWindowStart.value
    const loadedCount = ITEMS.value.itemsOnPage.length
    const loadedEnd = windowStart + loadedCount
    const totalCount = ITEMS.value.totalFiltered

    // Jump works both ways (up into trimmed head, down into phantom tail), even after EOF.
    if (shouldJumpInfiniteWindow(targetIndex, windowStart, loadedCount)) {
      const clamped = Math.min(Math.max(0, totalCount - 1), targetIndex)
      void jumpInfiniteToPage(getInfinitePageForIndex(clamped), {seekIndex: clamped})
      return
    }

    // Sequential append only when we have not exhausted the filtered set.
    if (infiniteScrollExhausted.value) return

    if (
      loadedEnd < totalCount
      && (
        targetIndex >= loadedEnd - INFINITE_PREFETCH_REMAINING_ITEMS
        || targetIndex >= loadedEnd
      )
    ) {
      void loadNextInfinitePage('user')
    }
  }

  const scheduleUserLoadIfNeeded = (): void => {
    ensureInfiniteCoversScroll()
  }

  const loadNextInfinitePage = async (
    source: 'user' | 'fill' = 'user',
  ): Promise<void> => {
    if (!is_infinite_scroll.value) return
    if (loader.value.is_busy || isLoadingMore.value || isInfiniteJumping) return
    if (isSeekLocked()) return
    if (infiniteScrollExhausted.value) return
    if (ITEMS.value.totalFiltered <= 0) return
    if (ITEMS.value.itemsOnPage.length >= ITEMS.value.totalFiltered) return

    const now = Date.now()
    const waitMs = INFINITE_LOAD_COOLDOWN_MS - (now - lastInfiniteLoadEndedAt)
    if (waitMs > 0) {
      if (source === 'user') {
        // Collapse burst scroll/intersect into one follow-up after cooldown.
        infiniteLoadPending.value = true
        if (!pendingUserLoadTimer) {
          pendingUserLoadTimer = setTimeout(() => {
            pendingUserLoadTimer = null
            infiniteLoadPending.value = false
            scheduleUserLoadIfNeeded()
          }, waitMs)
        }
      }
      return
    }

    if (source === 'fill') {
      if (shortViewportFillCount >= INFINITE_SHORT_VIEWPORT_FILL_MAX) return
      shortViewportFillCount += 1
    } else {
      shortViewportFillCount = 0
      clearPendingUserLoad()
    }

    isLoadingMore.value = true
    try {
      itemsStore.updateState({
        key: 'page',
        value: getNextInfiniteMediaPage(ITEMS.value.page),
      })
      await getItemsFromDb()
    } finally {
      isLoadingMore.value = false
      // Cooldown from completion — otherwise a long fetch lets the next page
      // start immediately and burst while the sentinel stays intersecting.
      lastInfiniteLoadEndedAt = Date.now()
      // Only chain another append for normal near-end scroll, never after seeks.
      if (source === 'user' && !isSeekLocked()) {
        const el = getMainScrollEl() as HTMLElement | null
        if (el && isNearBottom(el, 400) && !pendingUserLoadTimer) {
          infiniteLoadPending.value = true
          pendingUserLoadTimer = setTimeout(() => {
            pendingUserLoadTimer = null
            infiniteLoadPending.value = false
            scheduleUserLoadIfNeeded()
          }, INFINITE_LOAD_COOLDOWN_MS)
        }
      }
    }
  }

  const scheduleShortViewportFill = (): void => {
    if (pendingFillTimer) clearTimeout(pendingFillTimer)
    pendingFillTimer = setTimeout(() => {
      pendingFillTimer = null
      maybeLoadMoreIfNearBottom()
    }, INFINITE_LOAD_COOLDOWN_MS)
  }

  const maybeLoadMoreIfNearBottom = (): void => {
    if (!is_infinite_scroll.value) return
    if (loader.value.is_busy || isLoadingMore.value) return
    if (isSeekLocked()) return
    if (infiniteScrollExhausted.value) return
    if (ITEMS.value.totalFiltered <= 0) return
    if (ITEMS.value.itemsOnPage.length >= ITEMS.value.totalFiltered) return

    const el = refreshScrollRoot() || getMainScrollEl()
    if (!el) return

    const threshold = 240
    // Phantom filtered tail inflates scrollHeight — measure only loaded content.
    const contentHeight = getInfiniteContentBottom(el)
    const shortPage = contentHeight <= el.clientHeight + threshold

    // Only auto-fetch when the first screen isn't filled yet.
    // Near-bottom while scrolling is handled by the sentinel (single trigger).
    if (shortPage) {
      void loadNextInfinitePage('fill')
    }
  }

  const infiniteScrolling = (isIntersecting: boolean): void => {
    if (isIntersecting === false) return
    if (isSeekLocked()) return
    void loadNextInfinitePage('user')
  }

  const infiniteIntersectOptions = computed((): InfiniteIntersectOptions => ({
    handler: infiniteScrolling,
    options: {
      root: scrollRoot.value,
      // Modest lead — large margins after a seek looked like "extra pages".
      rootMargin: '320px 0px',
      threshold: 0,
    },
  }))

  // Scroll listener is required for scrollbar drags into the filtered phantom
  // zone (sentinel stays above the viewport and never intersects).
  const onMediaInfiniteScroll = (): void => {
    if (scrollLoadRaf) cancelAnimationFrame(scrollLoadRaf)
    scrollLoadRaf = requestAnimationFrame(() => {
      scrollLoadRaf = null

      const el = getMainScrollEl() as HTMLElement | null
      if (!el) return

      if (isSeekLocked()) return
      if (recoverEmptyViewport()) return

      const targetIndex = getVirtualScrollTargetIndex(el)
      const windowStart = infiniteWindowStart.value
      const loadedCount = ITEMS.value.itemsOnPage.length

      // Debounce far seeks so a dragging thumb settles before we replace the window.
      if (
        targetIndex != null
        && shouldJumpInfiniteWindow(targetIndex, windowStart, loadedCount)
      ) {
        infiniteLoadPending.value = true
        clearPendingJump()
        // Freeze the index from this scroll sample — do not re-read after pin
        // (geometry churn was overshooting several pages).
        const seekIndex = targetIndex
        pendingJumpTimer = setTimeout(() => {
          pendingJumpTimer = null
          if (isInfiniteJumping || isLoadingMore.value || loader.value.is_busy) return
          if (isSeekLocked()) return
          const clamped = Math.min(
            Math.max(0, ITEMS.value.totalFiltered - 1),
            Math.max(0, seekIndex),
          )
          void jumpInfiniteToPage(getInfinitePageForIndex(clamped), {seekIndex: clamped})
        }, INFINITE_JUMP_DEBOUNCE_MS)
        return
      }

      clearPendingJump()
      scheduleUserLoadIfNeeded()
    })
  }

  const bindMediaInfiniteScroll = (): void => {
    unbindMediaInfiniteScroll()
    if (!is_infinite_scroll.value) return
    mediaScrollEl = refreshScrollRoot() as HTMLElement | null
    mediaScrollEl?.addEventListener('scroll', onMediaInfiniteScroll, {passive: true})
  }

  const unbindMediaInfiniteScroll = (): void => {
    if (mediaScrollEl) {
      mediaScrollEl.removeEventListener('scroll', onMediaInfiniteScroll)
    }
    mediaScrollEl = null
    if (scrollLoadRaf) {
      cancelAnimationFrame(scrollLoadRaf)
      scrollLoadRaf = null
    }
    clearPendingJump()
    clearPendingUserLoad()
    if (pendingFillTimer) {
      clearTimeout(pendingFillTimer)
      pendingFillTimer = null
    }
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
    infiniteLoadPending,
    infiniteWindowStart,
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
    scrollTop: () => scrollTopToListStart(),
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
