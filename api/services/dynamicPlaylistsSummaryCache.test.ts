/**
 * @vitest-environment node
 */
import {afterEach, describe, expect, it, vi} from 'vitest'
import {
  clearDynamicPlaylistsSummaryCache,
  getCachedDynamicPlaylistsSummary,
  loadDynamicPlaylistsSummaryCached,
  setCachedDynamicPlaylistsSummary,
} from './dynamicPlaylistsSummaryCache'

afterEach(() => {
  clearDynamicPlaylistsSummaryCache()
  vi.useRealTimers()
})

describe('dynamicPlaylistsSummaryCache', () => {
  it('returns cached values within TTL and expires afterward', () => {
    vi.useFakeTimers()
    setCachedDynamicPlaylistsSummary(1, [{id: 7}])
    expect(getCachedDynamicPlaylistsSummary(1)).toEqual([{id: 7}])
    expect(getCachedDynamicPlaylistsSummary(2)).toBeNull()

    vi.advanceTimersByTime(45_001)
    expect(getCachedDynamicPlaylistsSummary(1)).toBeNull()
  })

  it('coalesces concurrent cold loads for the same media type', async () => {
    let calls = 0
    const loader = vi.fn(async () => {
      calls += 1
      await new Promise((resolve) => setTimeout(resolve, 20))
      return [{id: calls}]
    })

    const [a, b] = await Promise.all([
      loadDynamicPlaylistsSummaryCached(3, loader),
      loadDynamicPlaylistsSummaryCached(3, loader),
    ])

    expect(loader).toHaveBeenCalledTimes(1)
    expect(a).toEqual([{id: 1}])
    expect(b).toEqual([{id: 1}])
    expect(getCachedDynamicPlaylistsSummary(3)).toEqual([{id: 1}])
  })

  it('discards in-flight results after invalidation', async () => {
    let resolveLoader: ((value: unknown[]) => void) | undefined
    const pending = loadDynamicPlaylistsSummaryCached(5, () => new Promise<unknown[]>((resolve) => {
      resolveLoader = resolve
    }))

    clearDynamicPlaylistsSummaryCache()
    expect(resolveLoader).toBeTypeOf('function')
    resolveLoader!([{id: 99}])
    await expect(pending).resolves.toEqual([{id: 99}])
    expect(getCachedDynamicPlaylistsSummary(5)).toBeNull()
  })
})
