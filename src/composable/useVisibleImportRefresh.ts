import {nextTick, onBeforeUnmount, onMounted} from 'vue'
import {onMediaAdded} from './mediaAddedSync'
import {getMainScrollEl} from '@/utils/mainScroll'
import type {ItemsPageListQuery, MediaListResponse} from '@/types/itemsPage'
import type {MediaItem} from '@/types/stores'
import {typedApi} from '@/services/typedApi'
import {INFINITE_SCROLL_PAGE_SIZE} from '@shared/listPagination'

export function intersectsVisibleInsert(items: MediaItem[], ids: Set<number>, first: number, last: number): boolean {
  return items.slice(first, last + 1).some(item => ids.has(Number(item.id)))
}

/** Uses the regular list endpoint so filter, grouping and sort semantics stay on the server. */
export function useVisibleImportRefresh(options: {
  root: () => HTMLElement | null
  query: () => ItemsPageListQuery | null
  items: () => MediaItem[]
  start: () => number
  infinite: () => boolean
  busy: () => boolean
  identity: () => string
  database: () => string
  apply: (response: MediaListResponse, start: number) => void
  updateTotals?: (response: MediaListResponse) => void
}) {
  const pending = new Set<number>()
  let disposed = false
  let running = false
  let revision = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let unsubscribe: (() => void) | undefined
  let scrollRoot: Element | null = null
  let identity = ''
  const schedule = () => {
    if (disposed || !pending.size || timer) return
    timer = setTimeout(() => { timer = undefined; void refresh() }, 400)
  }
  const refresh = async () => {
    if (disposed || running || !pending.size) return
    if (identity !== options.identity()) { pending.clear(); return }
    if (options.busy()) { schedule(); return }
    const query = options.query()
    const root = options.root()
    const scroll = getMainScrollEl() as HTMLElement | null
    if (!query || !root || !scroll || document.hidden) return
    const bounds = scroll.getBoundingClientRect()
    const cards = [...root.querySelectorAll<HTMLElement>('[data-item-id]')].filter(card => {
      const rect = card.getBoundingClientRect()
      return rect.height > 0 && rect.bottom > bounds.top && rect.top < bounds.bottom
    })
    const before = options.items()
    if (!cards.length && before.length) return
    const indices = cards.map(card => before.findIndex(item => Number(item.id) === Number(card.dataset.itemId))).filter(i => i >= 0)
    const first = indices.length ? Math.min(...indices) : 0
    // An empty grid can show the first imported page.
    let last = indices.length ? Math.max(...indices) : INFINITE_SCROLL_PAGE_SIZE - 1
    // A short final row/page has visible empty slots where new cards can appear.
    if (indices.length && last === before.length - 1) {
      const tail = cards.find(card => Number(card.dataset.itemId) === Number(before[last]?.id))
      const tailRect = tail?.getBoundingClientRect()
      const grid = tail?.closest<HTMLElement>('[data-column-count], .items-page-grid, .masonry-grid')
      const columns = Number(grid?.dataset.columnCount)
        || (grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').filter(value => value && value !== 'none').length : 0)
        || 1
      if (tailRect && tailRect.bottom <= bounds.bottom) {
        const extraRows = Math.ceil(Math.max(0, bounds.bottom - tailRect.bottom) / tailRect.height)
        last += (columns - before.length % columns) % columns + extraRows * columns
      }
    }
    const anchor = cards[0]
    const anchorId = anchor?.dataset.itemId
    const anchorTop = anchor?.getBoundingClientRect().top
    const scrollTop = scroll.scrollTop
    const start = options.start()
    const fingerprint = JSON.stringify(query)
    const currentIdentity = options.identity()
    const snapshot = new Set(pending)
    const requestRevision = revision
    running = true
    let retry = false
    try {
      const size = options.infinite() ? INFINITE_SCROLL_PAGE_SIZE : query.limit
      const firstPage = options.infinite() ? Math.floor(start / INFINITE_SCROLL_PAGE_SIZE) + 1 : (query.page || 1)
      const count = options.infinite() ? Math.max(1, Math.ceil((start % INFINITE_SCROLL_PAGE_SIZE + before.length) / INFINITE_SCROLL_PAGE_SIZE)) : 1
      const responses = await Promise.all(Array.from({length: count}, (_, index) => typedApi.postItemsList('/api/media/items', {
        ...query, page: firstPage + index, limit: size, skipTotals: index > 0, includeNavigation: false,
      })))
      if (disposed || currentIdentity !== options.identity()) return
      if (options.busy() || fingerprint !== JSON.stringify(options.query()) || options.items() !== before
        || scroll.scrollTop !== scrollTop) {
        retry = true
        return
      }
      const offset = options.infinite() ? start % INFINITE_SCROLL_PAGE_SIZE : 0
      const windowSize = options.infinite() ? Math.max(before.length, INFINITE_SCROLL_PAGE_SIZE) : undefined
      const items = responses.flatMap(response => response.data.items || []).slice(offset, windowSize ? offset + windowSize : undefined)
      const response = responses[0]
      if (intersectsVisibleInsert(items, snapshot, first, last)) {
        options.apply({...response, data: {...response.data, items}}, start)
        if (revision === requestRevision) {
          for (const item of items) pending.delete(Number(item.id))
        }
      } else {
        // Keep phantom tail / pagination current so offscreen additions remain reachable.
        options.updateTotals?.(response)
      }
      await nextTick()
      if (disposed || scroll.scrollTop !== scrollTop || anchorTop == null) return
      const nextAnchor = [...root.querySelectorAll<HTMLElement>('[data-item-id]')].find(card => card.dataset.itemId === anchorId)
      if (nextAnchor) scroll.scrollTop += nextAnchor.getBoundingClientRect().top - anchorTop
    } catch (error) {
      console.error('Failed to refresh visible imported media:', error)
    } finally {
      running = false
      // New arrivals during the request get their own pass. Offscreen additions wait for scrolling.
      if (retry || revision !== requestRevision) schedule()
    }
  }
  onMounted(() => {
    scrollRoot = getMainScrollEl()
    scrollRoot?.addEventListener('scroll', schedule, {passive: true})
    document.addEventListener('visibilitychange', schedule)
    window.addEventListener('resize', schedule)
    unsubscribe = onMediaAdded((ids, database) => {
      if (database !== options.database()) return
      const current = options.identity()
      if (identity !== current) pending.clear()
      identity = current
      revision += 1
      for (const id of ids) pending.add(id)
      void refresh()
    })
  })
  onBeforeUnmount(() => {
    disposed = true
    clearTimeout(timer)
    unsubscribe?.()
    scrollRoot?.removeEventListener('scroll', schedule)
    document.removeEventListener('visibilitychange', schedule)
    window.removeEventListener('resize', schedule)
  })
}
