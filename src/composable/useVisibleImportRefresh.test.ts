import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {createApp, nextTick} from 'vue'
import {createPinia, setActivePinia} from 'pinia'
import {useAppStore} from '@/stores/app'
import {notifyMediaAdded, onMediaAdded} from './mediaAddedSync'
import {useVisibleImportRefresh} from './useVisibleImportRefresh'
import type {MediaItem} from '@/types/stores'
import {INFINITE_SCROLL_PAGE_SIZE} from '@shared/listPagination'

const post = vi.hoisted(() => vi.fn())
vi.mock('@/services/typedApi', () => ({typedApi: {postItemsList: post}}))
let cleanup: (() => void)[] = []
const item = (id: number) => ({id}) as MediaItem
const rect = (top: number, bottom: number) => ({top, bottom, height: bottom - top}) as DOMRect
beforeEach(() => {
  vi.useFakeTimers()
  setActivePinia(createPinia())
  useAppStore().dbPath = 'library-a'
  post.mockReset()
  Object.defineProperty(document, 'hidden', {configurable: true, value: false})
})
afterEach(() => {
  cleanup.forEach(fn => fn()); cleanup = []
  document.body.innerHTML = ''
  vi.useRealTimers()
})
function setup(config: {start?: number; infinite?: boolean; empty?: boolean} = {}) {
  let items = config.empty ? [] : [item(1), item(2), item(3)]
  const root = document.createElement('div')
  const scroll = document.createElement('div')
  scroll.className = 'main-scroll'
  scroll.scrollTop = 100
  scroll.getBoundingClientRect = () => rect(0, 100)
  document.body.append(scroll)
  scroll.append(root)
  let after = false
  for (const [id, top] of [[1, -100], [2, 0], [3, 50]]) {
    const card = document.createElement('div')
    card.dataset.itemId = String(id)
    card.getBoundingClientRect = () => rect(top + (after ? 50 : 0), top + 50 + (after ? 50 : 0))
    if (!config.empty) root.append(card)
  }
  const updateTotals = vi.fn()
  const apply = vi.fn(response => { items = response.data.items; after = true })
  const query = {mediaTypeId: 1, page: 1, limit: 60, sortBy: 'id', direction: 'desc', filters: []}
  const app = createApp({setup() {
    useVisibleImportRefresh({root: () => root, query: () => query, items: () => items, start: () => config.start || 0,
      infinite: () => config.infinite !== false, busy: () => false, identity: () => useAppStore().dbPath,
      database: () => useAppStore().dbPath, apply, updateTotals})
    return () => null
  }})
  app.mount(document.createElement('div'))
  cleanup.push(() => app.unmount())
  return {apply, scroll, query, updateTotals}
}
async function flush() { await vi.advanceTimersByTimeAsync(400); await nextTick() }

describe('import notifications', () => {
  it('deduplicates a continuous batch without postponing its delivery', async () => {
    const listener = vi.fn()
    cleanup.push(onMediaAdded(listener))
    notifyMediaAdded([1, 1])
    await vi.advanceTimersByTimeAsync(300)
    notifyMediaAdded([2])
    await vi.advanceTimersByTimeAsync(100)
    expect(listener).toHaveBeenCalledExactlyOnceWith([1, 2], 'library-a')
  })
  it('keeps databases separate while a batch is waiting', async () => {
    const listener = vi.fn()
    cleanup.push(onMediaAdded(listener))
    notifyMediaAdded([1])
    useAppStore().dbPath = 'library-b'
    notifyMediaAdded([2])
    await flush()
    expect(listener.mock.calls).toEqual([[[1], 'library-a'], [[2], 'library-b']])
  })
})
describe('visible import refresh', () => {
  it('updates the window only for an insertion in actual visible rows and restores its anchor', async () => {
    const {apply, scroll} = setup()
    post.mockResolvedValue({data: {items: [item(1), item(9), item(2)], totalFiltered: 4}})
    notifyMediaAdded([9])
    await flush()
    expect(apply).toHaveBeenCalledOnce()
    expect(scroll.scrollTop).toBe(150)
    expect(post.mock.calls[0][1]).toMatchObject({page: 1, limit: INFINITE_SCROLL_PAGE_SIZE, sortBy: 'id', includeNavigation: false})
  })
  it('leaves the grid untouched when the inserted item is in an overscan row', async () => {
    const {apply, scroll, updateTotals} = setup()
    post.mockResolvedValue({data: {items: [item(9), item(2), item(3)], totalFiltered: 4}})
    notifyMediaAdded([9])
    await flush()
    expect(apply).not.toHaveBeenCalled()
    expect(scroll.scrollTop).toBe(100)
    expect(updateTotals).toHaveBeenCalledOnce()
  })
  it('ignores additions excluded by the server filters', async () => {
    const {apply} = setup()
    post.mockResolvedValue({data: {items: [item(1), item(2), item(3)]}})
    notifyMediaAdded([9])
    await flush()
    expect(apply).not.toHaveBeenCalled()
  })
  it('discards a response if the user scrolls while it is loading', async () => {
    const {apply, scroll} = setup()
    let resolve!: (response: unknown) => void
    post.mockImplementation(() => new Promise(done => {resolve = done}))
    notifyMediaAdded([9])
    await flush()
    scroll.scrollTop = 200
    resolve({data: {items: [item(1), item(9), item(2)]}})
    await flush()
    expect(apply).not.toHaveBeenCalled()
  })
  it('drops an event from a previously active database', async () => {
    const {apply} = setup()
    notifyMediaAdded([9])
    useAppStore().dbPath = 'library-b'
    await flush()
    expect(post).not.toHaveBeenCalled()
    expect(apply).not.toHaveBeenCalled()
  })
  it('checks the absolute window after older infinite pages were trimmed', async () => {
    const {apply} = setup({start: 120})
    post.mockResolvedValue({data: {items: [item(1), item(9), item(2)]}})
    notifyMediaAdded([9])
    await flush()
    expect(post.mock.calls[0][1].page).toBe(Math.floor(120 / INFINITE_SCROLL_PAGE_SIZE) + 1)
    expect(apply.mock.calls[0][1]).toBe(120)
  })
  it('preserves the current page for a paginated grid', async () => {
    const {apply, query} = setup({infinite: false})
    query.page = 4
    post.mockResolvedValue({data: {items: [item(1), item(9), item(2)]}})
    notifyMediaAdded([9])
    await flush()
    expect(post.mock.calls[0][1].page).toBe(4)
    expect(apply).toHaveBeenCalledOnce()
  })
  it('fills visible empty slots at the end of a short grid', async () => {
    const {apply, scroll} = setup()
    scroll.getBoundingClientRect = () => rect(0, 200)
    post.mockResolvedValue({data: {items: [item(1), item(2), item(3), item(9)]}})
    notifyMediaAdded([9])
    await flush()
    expect(apply).toHaveBeenCalledOnce()
    expect(apply.mock.calls[0][0].data.items.map((entry: MediaItem) => entry.id)).toEqual([1, 2, 3, 9])
  })
  it('rechecks offscreen additions when the viewport changes', async () => {
    const {apply, scroll} = setup()
    post.mockResolvedValue({data: {items: [item(9), item(2), item(3)]}})
    notifyMediaAdded([9])
    await flush()
    expect(apply).not.toHaveBeenCalled()
    scroll.getBoundingClientRect = () => rect(-100, 100)
    scroll.dispatchEvent(new Event('scroll'))
    await flush()
    expect(apply).toHaveBeenCalledOnce()
  })
  it('shows additions in an empty grid', async () => {
    const {apply} = setup({empty: true})
    post.mockResolvedValue({data: {items: [item(9)]}})
    notifyMediaAdded([9])
    await flush()
    expect(apply).toHaveBeenCalledOnce()
  })
  it('cancels queued work on unmount', async () => {
    setup()
    notifyMediaAdded([9])
    cleanup.pop()!()
    await flush()
    expect(post).not.toHaveBeenCalled()
  })
})
