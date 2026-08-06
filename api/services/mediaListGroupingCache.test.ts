import {afterEach, describe, expect, it} from 'vitest'
import {
  buildMediaListGroupingCacheKey,
  clearMediaListGroupingCache,
  getCachedMediaListGrouping,
  setCachedMediaListGrouping,
} from './mediaListGroupingCache'

describe('mediaListGroupingCache', () => {
  afterEach(() => {
    clearMediaListGroupingCache()
  })

  it('keys by filters, groupBy, and sort', () => {
    const a = buildMediaListGroupingCacheKey({
      mediaTypeId: 1,
      filters: [],
      groupBy: 'path',
      sortBy: 'name',
      direction: 'asc',
    })
    const b = buildMediaListGroupingCacheKey({
      mediaTypeId: 1,
      filters: [],
      groupBy: 'rating',
      sortBy: 'name',
      direction: 'asc',
    })
    expect(a).not.toBe(b)
  })

  it('stores and returns grouping results until cleared', () => {
    const key = buildMediaListGroupingCacheKey({
      mediaTypeId: 1,
      groupBy: 'path',
    })
    const value = {
      groups: [{key: '/a', label: '/a', count: 2}],
      orderedIds: [2, 1],
    }
    setCachedMediaListGrouping(key, value)
    expect(getCachedMediaListGrouping(key)).toEqual(value)
    clearMediaListGroupingCache()
    expect(getCachedMediaListGrouping(key)).toBeNull()
  })
})
