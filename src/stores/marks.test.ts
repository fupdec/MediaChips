import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { typedApi } from '@/services/typedApi'
import { useMarksStore } from './marks'

vi.mock('@/services/typedApi', () => ({ typedApi: { postMarkItems: vi.fn() } }))

function deferredResponse() {
  let resolve!: (value: ReturnType<typeof response>) => void
  let reject!: (error: Error) => void
  const promise = new Promise<ReturnType<typeof response>>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

function response(ids: number[], total = ids.length) {
  return { data: { items: ids.map(id => ({ id })), total, totalFiltered: total } }
}

describe('marks loading', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('cancels superseded searches and ignores their late responses', async () => {
    const old = deferredResponse()
    const fresh = deferredResponse()
    vi.mocked(typedApi.postMarkItems)
      .mockReturnValueOnce(old.promise as never)
      .mockReturnValueOnce(fresh.promise as never)
    const store = useMarksStore()
    const first = store.setSearch('old')
    const firstSignal = vi.mocked(typedApi.postMarkItems).mock.calls[0][1]?.signal
    const second = store.setSearch('new')
    expect(firstSignal?.aborted).toBe(true)
    fresh.resolve(response([2]))
    await second
    old.resolve(response([1]))
    await first
    expect(store.marksOnPage).toEqual([{ id: 2 }])
    expect(store.search).toBe('new')
    expect(store.isLoading).toBe(false)
  })

  it('does not let stale errors clear results or reset a newer loading state', async () => {
    const old = deferredResponse()
    const fresh = deferredResponse()
    vi.mocked(typedApi.postMarkItems)
      .mockReturnValueOnce(old.promise as never)
      .mockReturnValueOnce(fresh.promise as never)
    const store = useMarksStore()
    const first = store.fetchMarks()
    const second = store.reloadMarks()
    old.reject(new Error('superseded'))
    await first
    expect(store.isLoading).toBe(true)
    fresh.resolve(response([2]))
    await second
    expect(store.marksOnPage).toEqual([{ id: 2 }])
  })

  it('retries the same page after a failed append and prevents concurrent appends', async () => {
    vi.mocked(typedApi.postMarkItems).mockResolvedValueOnce(response([1], 3) as never)
    const store = useMarksStore()
    await store.fetchMarks()
    const failed = deferredResponse()
    vi.mocked(typedApi.postMarkItems).mockReturnValueOnce(failed.promise as never)
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const append = store.loadNextPage()
      await store.loadNextPage()
      expect(typedApi.postMarkItems).toHaveBeenCalledTimes(2)
      failed.reject(new Error('offline'))
      await append
      expect(store.page).toBe(1)
      expect(store.marksOnPage).toEqual([{ id: 1 }])
      vi.mocked(typedApi.postMarkItems).mockResolvedValueOnce(response([2], 3) as never)
      await store.loadNextPage()
      expect(vi.mocked(typedApi.postMarkItems).mock.calls.map(([body]) => body.page)).toEqual([1, 2, 2])
      expect(store.page).toBe(2)
      expect(store.marksOnPage).toEqual([{ id: 1 }, { id: 2 }])
    } finally {
      log.mockRestore()
    }
  })

  it('discards an old append when filters are reloaded', async () => {
    vi.mocked(typedApi.postMarkItems).mockResolvedValueOnce(response([1], 3) as never)
    const store = useMarksStore()
    await store.fetchMarks()
    const old = deferredResponse()
    const fresh = deferredResponse()
    vi.mocked(typedApi.postMarkItems)
      .mockReturnValueOnce(old.promise as never)
      .mockReturnValueOnce(fresh.promise as never)
    const append = store.loadNextPage()
    const reload = store.setSearch('new')
    old.resolve(response([2], 3))
    await append
    expect(store.isLoading).toBe(true)
    expect(store.isLoadingMore).toBe(false)
    fresh.resolve(response([10]))
    await reload
    expect(store.marksOnPage).toEqual([{ id: 10 }])
    expect(store.page).toBe(1)
  })
})
