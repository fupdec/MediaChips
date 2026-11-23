import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {effectScope, reactive, type EffectScope} from 'vue'
import {useSelectionFilesize} from './useSelectionFilesize'

const mocks = vi.hoisted(() => ({stats: vi.fn(), filterStats: vi.fn(), store: {} as any}))
vi.mock('@/stores/items', () => ({useItemsStore: () => mocks.store}))
vi.mock('@/services/typedApi', () => ({typedApi: {getMediaSelectionStats: mocks.stats, getMediaFilterSelectionStats: mocks.filterStats}}))
let scope: EffectScope
function start() {
  scope = effectScope()
  return scope.run(() => useSelectionFilesize())!
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  mocks.store = reactive({type: 'media', selection: [1], entities: [{id: 1, filesize: 10}]})
})
afterEach(() => {
  scope?.stop()
  vi.useRealTimers()
})

describe('selected file size', () => {
  it('sums loaded items locally, without treating equal counts as all-filtered selection', () => {
    mocks.store.totalFiltered = 1
    mocks.store.totalFilesize = 999
    const state = start()
    expect(state.filesize.value).toBe(10)
    expect(mocks.stats).not.toHaveBeenCalled()
  })

  it('uses server totals for files outside the current page', async () => {
    mocks.store.selection = [1, 2]
    mocks.stats.mockResolvedValue({data: {count: 2, filesize: 30}})
    const state = start()
    expect(state.filesize.value).toBeNull()
    expect(state.loading.value).toBe(true)
    await vi.advanceTimersByTimeAsync(150)
    expect(mocks.stats).toHaveBeenCalledWith([1, 2], expect.anything())
    expect(state.filesize.value).toBe(30)
  })

  it('ignores an old response after the selection changes and aborts its request', async () => {
    mocks.store.selection = [2]
    let resolve!: (value: unknown) => void
    mocks.stats.mockImplementation(() => new Promise(done => {resolve = done}))
    const state = start()
    await vi.advanceTimersByTimeAsync(150)
    const signal = mocks.stats.mock.calls[0][1].signal
    mocks.store.selection = [1]
    expect(signal.aborted).toBe(true)
    expect(state.filesize.value).toBe(10)
    resolve({data: {count: 1, filesize: 999}})
    await vi.advanceTimersByTimeAsync(0)
    expect(state.filesize.value).toBe(10)
  })

  it('keeps size unknown on error instead of displaying a partial sum', async () => {
    mocks.store.selection = [1, 2]
    mocks.stats.mockRejectedValue(new Error('offline'))
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const state = start()
    await vi.advanceTimersByTimeAsync(150)
    expect(state.filesize.value).toBeNull()
    expect(state.loading.value).toBe(false)
    warning.mockRestore()
  })
})


it('splits a large off-page selection into bounded aggregate requests', async () => {
  mocks.store.selection = Array.from({length: 5001}, (_, i) => i + 1)
  mocks.stats.mockImplementation(async (ids: number[]) => ({data: {count: ids.length, filesize: ids.length * 10}}))
  const state = start()
  await vi.advanceTimersByTimeAsync(150)
  expect(mocks.stats.mock.calls.map(([ids]) => ids.length)).toEqual([5000, 1])
  expect(state.filesize.value).toBe(50010)
})

describe('whole-filter selection', () => {
  const filter = {mediaTypeId: 1}
  it('asks the server by filter while the selection is untouched', async () => {
    mocks.store.selection = Array.from({length: 6000}, (_, i) => i + 1)
    mocks.store.selectionRevision = 3
    mocks.store.filterSelectionScope = {revision: 3, count: 6000, filter}
    mocks.filterStats.mockResolvedValue({data: {count: 6000, filesize: 777}})
    const state = start()
    await vi.advanceTimersByTimeAsync(150)
    expect(mocks.filterStats).toHaveBeenCalledWith(filter, expect.anything())
    expect(mocks.stats).not.toHaveBeenCalled()
    expect(state.filesize.value).toBe(777)
  })

  it('falls back to ID lists once the selection was edited', async () => {
    mocks.store.selection = [1, 2]
    mocks.store.selectionRevision = 4
    mocks.store.filterSelectionScope = {revision: 3, count: 2, filter}
    mocks.stats.mockResolvedValue({data: {count: 2, filesize: 30}})
    start()
    await vi.advanceTimersByTimeAsync(150)
    expect(mocks.filterStats).not.toHaveBeenCalled()
    expect(mocks.stats).toHaveBeenCalled()
  })
})
