import {useVisibleImportRefresh} from './useVisibleImportRefresh'
import {useAppStore} from '@/stores/app'
import {ref, computed, nextTick} from 'vue'
import uniqBy from 'lodash/uniqBy'
import {cloneFilters} from '@/utils/filterClone'
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
import {
  trimInfiniteScrollItems,
  getInfiniteJumpWindowStart,
  INFINITE_SCROLL_MAX_ITEMS,
  resolvePageLimit,
  INFINITE_SCROLL_PAGE_SIZE,
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

/**
 * Cards fetched by a scrollbar jump. A multiple of the append page size, so the
 * next sequential page starts exactly where the window ends.
 */
export const INFINITE_JUMP_WINDOW_ITEMS = INFINITE_PAGE_SIZE * 8

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
  // Near upward peek (within a couple pages) still jumps — but pin-to-seek
  // (not window top) keeps the viewport stable. Far upward always jumps.
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

/** True when the viewport is near the loaded data-end (append zone), not deep
 * in the filtered phantom tail (jump zone). */
export function isNearInfiniteDataEnd(input: {
  scrollTop: number
  clientHeight: number
  contentBottom: number
  threshold?: number
}): boolean {
  const threshold = Math.max(0, Number(input.threshold) || 240)
  const viewBottom = Number(input.scrollTop) + Number(input.clientHeight)
  const bottom = Number(input.contentBottom) || 0
  const distancePastEnd = viewBottom - bottom
  return distancePastEnd >= -threshold && distancePastEnd <= threshold * 2
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
  keepFullInfiniteWindow,
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
  /** Virtual grid keeps DOM small, so nothing is trimmed from the head (no blank gap on scroll up). */
  const infiniteTrimMax = () => (
    keepFullInfiniteWindow?.() ? Number.POSITIVE_INFINITY : INFINITE_SCROLL_MAX_ITEMS
  )

  let listFetchSeq = 0
  let listAbortController: AbortController | null = null
  let lastInfiniteLoadEndedAt = 0
  let shortViewportFillCount = 0
  let pendingFillTimer: ReturnType<typeof setTimeout> | null = null
  let pendingUserLoadTimer: ReturnType<typeof setTimeout> | null = null
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

    if (is_infinite_scroll.value && props.items_type !== 'media') {
      const trimResult = trimInfiniteScrollItems(nextItems, infiniteTrimMax())
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

  let lastListQuery: ItemsPageListQuery | null = null
  const appStore = useAppStore()
  useVisibleImportRefresh({
    root: () => {
      const container = _container.value
      return container instanceof HTMLElement ? container : (container as { $el?: HTMLElement } | null)?.$el || null
    },
    database: () => appStore.dbPath,
    query: () => props.items_type === 'media' && !ITEMS.value.listScopeIds && lastListQuery?.sortBy !== 'shuffle' ? lastListQuery : null,
    items: () => ITEMS.value.itemsOnPage,
    start: () => is_infinite_scroll.value ? infiniteWindowStart.value : 0,
    infinite: () => is_infinite_scroll.value,
    busy: () => loader.value.is_busy || isLoadingMore.value || infiniteLoadPending.value,
    identity: () => JSON.stringify([appStore.dbPath, props.mediaTypeId, props.tagId, props.tabId, ITEMS.value.filters, ITEMS.value.filtersJoin, ITEMS.value.sortBy, ITEMS.value.sortDir, ITEMS.value.groupBy, ITEMS.value.find_duplicates]),
    updateTotals: (response) => {
      if (response.data.totalFiltered != null) {
        total.value = response.data.totalFiltered
        itemsStore.updateState({key: 'totalFiltered', value: total.value})
        const limit = resolvePageLimit(is_infinite_scroll.value ? INFINITE_PAGE_SIZE : ITEMS.value.limit)
        if (limit) pages.value = Math.max(1, Math.ceil(total.value / limit))
        infiniteScrollExhausted.value = false
      }
      if (response.data.total != null) totalInDb.value = response.data.total
      if (response.data.totalFilesize != null) {
        itemsStore.updateState({key: 'totalFilesize', value: response.data.totalFilesize})
      }
    },
    apply: (response, start) => {
      const currentPage = ITEMS.value.page
      applyListResponse(response, {absoluteWindowStart: start, requestedPage: currentPage})
      itemsStore.updateState({key: 'page', value: currentPage})
      const limit = resolvePageLimit(is_infinite_scroll.value ? INFINITE_PAGE_SIZE : ITEMS.value.limit)
      if (limit) pages.value = Math.max(1, Math.ceil(total.value / limit))
    },
  })

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

    query.filtersJoin = ITEMS.value.filtersJoin
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

    lastListQuery = {...query}

    // Never abort an in-flight append — scroll bursts used to cancel page N and
    // leave `page` advanced with no rows, so further scrolling appeared stuck.
    if (!appendListPage) {
      abortPendingListFetch()
    }
    const requestSeq = ++listFetchSeq
    const abortController = new AbortController()
    listAbortController = abortController

    if (!appendListPage && !isInfiniteJump) {
      itemsStore.updateState({key: 'isFiltersLoaded', value: false})
      loader.value.is_busy = true
      loader.value.show = false
    }
    // Infinite jumps keep the grid mounted (isLoadingMore / slot spinner only).

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
        && infiniteWindowStart.value + ITEMS.value.itemsOnPage.length >= ITEMS.value.totalFiltered
      ) {
        infiniteScrollExhausted.value = true
      } else if (
        !isInfiniteJump
        && (append || is_infinite_scroll.value)
      ) {
        // Fill short viewports only — never while a scrollbar jump is filling.
        scheduleShortViewportFill()
      }

      return true
    }

    try {
      let response = await postListQuery(query, abortController.signal)

      // Appends must apply even if a newer append started (no abort above).
      // Full refresh / jump may supersede — drop stale non-append responses.
      if (!appendListPage && requestSeq !== listFetchSeq) {
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
      if (isAbortError(error)) {
        // Full refresh aborted this append — rewind page so the next scroll can retry.
        if (appendListPage && ITEMS.value.itemsOnPage.length > 0) {
          itemsStore.updateState({
            key: 'page',
            value: Math.max(1, Number(ITEMS.value.page || 1) - 1),
          })
        }
        return
      }
      if (!appendListPage && requestSeq !== listFetchSeq) {
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
        infiniteTrimMax(),
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

  const clearPendingUserLoad = (): void => {
    if (pendingUserLoadTimer) {
      clearTimeout(pendingUserLoadTimer)
      pendingUserLoadTimer = null
    }
    infiniteLoadPending.value = false
  }

  // IntersectionObserver supplies proximity without synchronous layout reads.
  let infiniteEndVisible = false
  const scheduleUserLoadIfNeeded = (): void => {
    if (infiniteEndVisible) void loadNextInfinitePage('user')
  }

  const loadNextInfinitePage = async (
    source: 'user' | 'fill' = 'user',
  ): Promise<void> => {
    if (!is_infinite_scroll.value) return
    if (loader.value.is_busy || isLoadingMore.value) return
    if (infiniteScrollExhausted.value) return
    if (ITEMS.value.totalFiltered <= 0) return
    if (infiniteWindowStart.value + ITEMS.value.itemsOnPage.length >= ITEMS.value.totalFiltered) return

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
      // Continue only while the observed end is still near the viewport.
      if (source === 'user') {
        if (infiniteEndVisible && !pendingUserLoadTimer) {
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

  /**
   * Scrollbar seek: replace the loaded window with the one that contains
   * `seekIndex` (absolute index in the filtered list). Returns false when
   * nothing was requested.
   */
  const jumpInfiniteWindow = async (seekIndex: number): Promise<boolean> => {
    if (!is_infinite_scroll.value) return false
    if (loader.value.is_busy || isLoadingMore.value) return false
    const totalFiltered = Number(ITEMS.value.totalFiltered) || 0
    if (totalFiltered <= 0) return false

    const windowSize = INFINITE_JUMP_WINDOW_ITEMS
    const start = getInfiniteJumpWindowStart({
      seekIndex,
      totalCount: totalFiltered,
      currentWindowStart: infiniteWindowStart.value,
      windowSize,
      pageSize: windowSize,
    })
    if (start === infiniteWindowStart.value) return false

    clearPendingUserLoad()
    isLoadingMore.value = true
    try {
      await getItemsFromDb(undefined, {
        infiniteJumpPage: Math.floor(start / windowSize) + 1,
        infiniteJumpLimit: windowSize,
        absoluteWindowStart: start,
      })
    } finally {
      isLoadingMore.value = false
      lastInfiniteLoadEndedAt = Date.now()
    }
    return true
  }

  const scheduleShortViewportFill = (): void => {
    if (pendingFillTimer) clearTimeout(pendingFillTimer)
    pendingFillTimer = setTimeout(() => {
      pendingFillTimer = null
      maybeLoadMoreIfNearBottom()
    }, INFINITE_LOAD_COOLDOWN_MS)
  }

  // Initial fill and subsequent appends use the same observed sentinel.
  const maybeLoadMoreIfNearBottom = (): void => {
    scheduleUserLoadIfNeeded()
  }

  const infiniteScrolling = (isIntersecting: boolean): void => {
    infiniteEndVisible = isIntersecting
    if (!isIntersecting) return
    void loadNextInfinitePage('user')
  }

  const infiniteIntersectOptions = computed((): InfiniteIntersectOptions => ({
    handler: infiniteScrolling,
    options: {
      root: scrollRoot.value,
      // Start fetching before the end of the rendered list reaches the viewport.
      rootMargin: '240px 0px',
      threshold: 0,
    },
  }))

  const bindMediaInfiniteScroll = (): void => {
    refreshScrollRoot()
  }

  const unbindMediaInfiniteScroll = (): void => {
    infiniteEndVisible = false
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
    jumpInfiniteWindow,
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
