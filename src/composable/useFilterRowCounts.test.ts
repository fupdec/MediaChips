import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {createApp, nextTick, ref} from 'vue'
import type {FilterObject} from '@/types/common'
import {typedApi} from '@/services/typedApi'
import {useFilterRowCounts, type FilterRowCounts, type FilterRowCountsContext} from './useFilterRowCounts'
import type {Ref} from 'vue'

vi.mock('@/services/typedApi', () => ({typedApi: {postItemsList: vi.fn()}}))
const unmounts: Array<() => void> = []
beforeEach(() => { vi.useFakeTimers(); vi.resetAllMocks() })
afterEach(() => { unmounts.splice(0).forEach(fn => fn()); vi.useRealTimers() })

function setup() {
  const filters = ref<FilterObject[]>([{id: 1, param: 'name', type: 'text', cond: 'contains',
    val: 'old', active: true, lock: false, note: null}])
  const enabled = ref(true)
  const context = ref<FilterRowCountsContext | null>({url: '/api/Media/items', mediaTypeId: 1})
  let counts!: Ref<FilterRowCounts>
  const app = createApp({setup() {
    counts = useFilterRowCounts(filters, context, enabled)
    return () => null
  }})
  app.mount(document.createElement('div'))
  const unmount = () => app.unmount()
  unmounts.push(unmount)
  return {filters, enabled, context, counts, unmount}
}
function response(matched = 2) { return {data: {totalFiltered: matched, total: 10}} }
function deferred() {
  let resolve!: (value: ReturnType<typeof response>) => void
  const promise = new Promise<ReturnType<typeof response>>(done => { resolve = done })
  return {promise, resolve}
}
async function run() { await nextTick(); await vi.advanceTimersByTimeAsync(450) }

describe('filter row counts', () => {
  it('debounces rapid edits and reuses cached counts', async () => {
    vi.mocked(typedApi.postItemsList).mockResolvedValue(response() as never)
    const {filters, counts} = setup()
    filters.value[0].val = 'first'
    await nextTick()
    await vi.advanceTimersByTimeAsync(200)
    filters.value[0].val = 'last'
    await run()
    expect(typedApi.postItemsList).toHaveBeenCalledTimes(1)
    expect(vi.mocked(typedApi.postItemsList).mock.calls[0][1].filters?.[0].val).toBe('last')
    expect(counts.value).toEqual({'1': {matched: 2, total: 10}})
    filters.value[0].val = 'first'
    await run()
    filters.value[0].val = 'last'
    await run()
    expect(typedApi.postItemsList).toHaveBeenCalledTimes(2)
  })

  it('cancels on edit before the debounce expires and ignores late responses', async () => {
    const old = deferred()
    vi.mocked(typedApi.postItemsList).mockReturnValueOnce(old.promise as never)
    const {filters, counts} = setup()
    await run()
    const signal = vi.mocked(typedApi.postItemsList).mock.calls[0][2]?.signal
    filters.value[0].val = 'new'
    await nextTick()
    expect(signal?.aborted).toBe(true)
    old.resolve(response(9))
    await vi.advanceTimersByTimeAsync(0)
    expect(counts.value).toEqual({})
    vi.mocked(typedApi.postItemsList).mockResolvedValue(response(3) as never)
    await run()
    expect(counts.value).toEqual({'1': {matched: 3, total: 10}})
    filters.value[0].val = 'old'
    await run()
    // A superseded response must not enter the cache either.
    expect(typedApi.postItemsList).toHaveBeenCalledTimes(3)
  })

  it('cancels when hidden without requesting remaining rows', async () => {
    const old = deferred()
    vi.mocked(typedApi.postItemsList).mockReturnValueOnce(old.promise as never)
    const {filters, enabled, counts} = setup()
    filters.value.push({...filters.value[0], id: 2, val: 'second'})
    await run()
    const signal = vi.mocked(typedApi.postItemsList).mock.calls[0][2]?.signal
    enabled.value = false
    await nextTick()
    expect(signal?.aborted).toBe(true)
    old.resolve(response())
    await run()
    expect(counts.value).toEqual({})
    expect(typedApi.postItemsList).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels active requests and pending timers on unmount', async () => {
    const old = deferred()
    vi.mocked(typedApi.postItemsList).mockReturnValueOnce(old.promise as never)
    const {counts} = setup()
    await run()
    const signal = vi.mocked(typedApi.postItemsList).mock.calls[0][2]?.signal
    unmounts.pop()!()
    expect(signal?.aborted).toBe(true)
    old.resolve(response())
    await run()
    expect(counts.value).toEqual({})
    setup()
    unmounts.pop()!()
    await run()
    expect(typedApi.postItemsList).toHaveBeenCalledTimes(1)
  })

  it('evicts old cache entries during long editing sessions', async () => {
    vi.mocked(typedApi.postItemsList).mockResolvedValue(response() as never)
    const {filters} = setup()
    for (let value = 0; value <= 200; value++) {
      filters.value[0].val = String(value)
      await run()
    }
    filters.value[0].val = '0'
    await run()
    expect(typedApi.postItemsList).toHaveBeenCalledTimes(202)
  })
})
