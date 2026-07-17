import { describe, expect, it } from 'vitest'
import {
  INFINITE_SCROLL_MAX_ITEMS,
  INFINITE_SCROLL_PAGE_SIZE,
  resolvePageLimit,
  shouldPaginateMediaList,
  slicePage,
  trimInfiniteScrollItems,
} from '../../shared/listPagination'

describe('mediaItemsPagination', () => {
  it('returns null for missing or non-positive limits', () => {
    expect(resolvePageLimit(null)).toBeNull()
    expect(resolvePageLimit(0)).toBeNull()
    expect(resolvePageLimit(-1)).toBeNull()
  })

  it('maps limit 101 to infinite-scroll page size', () => {
    expect(resolvePageLimit(101)).toBe(INFINITE_SCROLL_PAGE_SIZE)
    expect(resolvePageLimit(150)).toBe(INFINITE_SCROLL_PAGE_SIZE)
  })

  it('keeps regular page sizes unchanged', () => {
    expect(resolvePageLimit(25)).toBe(25)
    expect(resolvePageLimit(50)).toBe(50)
  })

  it('paginates only when ids are absent and limit is set', () => {
    expect(shouldPaginateMediaList({ limit: 25 })).toBe(true)
    expect(shouldPaginateMediaList({ limit: 101 })).toBe(true)
    expect(shouldPaginateMediaList({ ids: [1], limit: 25 })).toBe(false)
    expect(shouldPaginateMediaList({ limit: null })).toBe(false)
  })

  it('slices pages using the resolved limit', () => {
    const items = Array.from({ length: 30 }, (_, index) => index + 1)

    expect(slicePage(items, 1, 25)).toHaveLength(25)
    expect(slicePage(items, 2, 25)).toEqual([26, 27, 28, 29, 30])
    expect(slicePage(items, 1, 101)).toHaveLength(INFINITE_SCROLL_PAGE_SIZE)
  })

  it('trims infinite-scroll items to the configured window', () => {
    const overflow = 50
    const items = Array.from({ length: INFINITE_SCROLL_MAX_ITEMS + overflow }, (_, index) => index + 1)

    const result = trimInfiniteScrollItems(items)
    expect(result.items).toHaveLength(INFINITE_SCROLL_MAX_ITEMS)
    expect(result.trimmedFromTop).toBe(overflow)
    expect(result.items[0]).toBe(overflow + 1)
    expect(result.items[INFINITE_SCROLL_MAX_ITEMS - 1]).toBe(INFINITE_SCROLL_MAX_ITEMS + overflow)
  })
})
