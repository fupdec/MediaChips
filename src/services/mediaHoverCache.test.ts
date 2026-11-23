import { beforeEach, describe, expect, it, vi } from 'vitest'
import { typedApi } from '@/services/typedApi'
import { getCachedMediaForHover, invalidateMediaHoverCache, loadMediaForHover } from './mediaHoverCache'
import type { MediaItem } from '@/types/stores'

vi.mock('@/services/typedApi', () => ({ typedApi: { getMediaItems: vi.fn() } }))
vi.mock('@/stores/items', () => ({ useItemsStore: () => ({ getItemById: () => undefined }) }))

function deferredResponse() {
  let resolve!: (response: { data: { items: MediaItem[] } }) => void
  const promise = new Promise<{ data: { items: MediaItem[] } }>(done => { resolve = done })
  return { promise, resolve }
}

describe('media hover requests', () => {
  beforeEach(() => {
    invalidateMediaHoverCache()
    vi.resetAllMocks()
  })

  it('shares concurrent requests and caches their result', async () => {
    const response = deferredResponse()
    vi.mocked(typedApi.getMediaItems).mockReturnValue(response.promise as never)
    const first = loadMediaForHover(1, 42)
    const second = loadMediaForHover(1, 42)
    await Promise.resolve()
    expect(typedApi.getMediaItems).toHaveBeenCalledTimes(1)
    const item = { id: 42, name: 'Movie' }
    response.resolve({ data: { items: [item] } })
    expect(await first).toEqual(item)
    expect(await second).toEqual(item)
    expect(await loadMediaForHover(1, 42)).toEqual(item)
    expect(typedApi.getMediaItems).toHaveBeenCalledTimes(1)
  })

  it.each(['single', 'all'])('does not cache invalidated responses (%s)', async mode => {
    const old = deferredResponse()
    const fresh = deferredResponse()
    vi.mocked(typedApi.getMediaItems)
      .mockReturnValueOnce(old.promise as never)
      .mockReturnValueOnce(fresh.promise as never)
    const first = loadMediaForHover(1, 42)
    await Promise.resolve()
    if (mode === 'single') invalidateMediaHoverCache(1, 42)
    else invalidateMediaHoverCache()
    const second = loadMediaForHover(1, 42)
    await Promise.resolve()
    old.resolve({ data: { items: [{ id: 42, name: 'Old' }] } })
    await first
    expect(getCachedMediaForHover(1, 42)).toBeUndefined()
    const third = loadMediaForHover(1, 42)
    await Promise.resolve()
    expect(typedApi.getMediaItems).toHaveBeenCalledTimes(2)
    fresh.resolve({ data: { items: [{ id: 42, name: 'Fresh' }] } })
    await Promise.all([second, third])
    expect(getCachedMediaForHover(1, 42)?.name).toBe('Fresh')
  })

  it('allows retry after failure', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      vi.mocked(typedApi.getMediaItems).mockRejectedValueOnce(new Error('offline'))
      expect(await loadMediaForHover(1, 42)).toBeNull()
      vi.mocked(typedApi.getMediaItems).mockResolvedValueOnce({ data: { items: [{ id: 42 }] } } as never)
      expect(await loadMediaForHover(1, 42)).toEqual({ id: 42 })
      expect(typedApi.getMediaItems).toHaveBeenCalledTimes(2)
    } finally {
      log.mockRestore()
    }
  })
})
