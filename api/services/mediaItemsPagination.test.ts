import { describe, expect, it } from 'vitest'
import {
  INFINITE_SCROLL_MAX_ITEMS,
  INFINITE_SCROLL_PAGE_SIZE,
  getInfiniteJumpWindowStart,
  orderRowsByIds,
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

  it('maps only the 101 sentinel to infinite-scroll page size', () => {
    expect(resolvePageLimit(101)).toBe(INFINITE_SCROLL_PAGE_SIZE)
    expect(resolvePageLimit(150)).toBe(150)
    expect(resolvePageLimit(INFINITE_SCROLL_MAX_ITEMS)).toBe(INFINITE_SCROLL_MAX_ITEMS)
  })

  it('keeps regular page sizes unchanged', () => {
    expect(resolvePageLimit(25)).toBe(25)
    expect(resolvePageLimit(50)).toBe(50)
  })

  it('aligns single fat jump windows and keeps the seek inside', () => {
    const upward = getInfiniteJumpWindowStart({
      seekIndex: 500,
      totalCount: 20_000,
      currentWindowStart: 2_000,
      windowSize: INFINITE_SCROLL_MAX_ITEMS,
      pageSize: INFINITE_SCROLL_MAX_ITEMS,
    })
    expect(upward % INFINITE_SCROLL_MAX_ITEMS).toBe(0)
    expect(upward).toBeLessThanOrEqual(500)
    expect(upward + INFINITE_SCROLL_MAX_ITEMS).toBeGreaterThan(500)

    const downward = getInfiniteJumpWindowStart({
      seekIndex: 5_000,
      totalCount: 20_000,
      currentWindowStart: 0,
      windowSize: INFINITE_SCROLL_MAX_ITEMS,
      pageSize: INFINITE_SCROLL_MAX_ITEMS,
    })
    expect(downward % INFINITE_SCROLL_MAX_ITEMS).toBe(0)
    expect(downward).toBeLessThanOrEqual(5_000)
    expect(downward + INFINITE_SCROLL_MAX_ITEMS).toBeGreaterThan(5_000)
    // Downward bias (0.25) keeps the seek in the upper half of the window.
    expect(5_000 - downward).toBeLessThan(INFINITE_SCROLL_MAX_ITEMS * 0.85)
  })

  it('paginates only when ids are absent and limit is set', () => {
    expect(shouldPaginateMediaList({ limit: 25 })).toBe(true)
    expect(shouldPaginateMediaList({ limit: 101 })).toBe(true)
    expect(shouldPaginateMediaList({ ids: [1], limit: 25 })).toBe(false)
    expect(shouldPaginateMediaList({ limit: null })).toBe(false)
  })

  it('slices pages using the resolved limit', () => {
    const items = Array.from({ length: INFINITE_SCROLL_PAGE_SIZE + 5 }, (_, index) => index + 1)

    expect(slicePage(items, 1, 25)).toEqual(items.slice(0, 25))
    expect(slicePage(items, 2, 25)).toEqual(items.slice(25, 50))
    expect(slicePage(items, 1, 101)).toEqual(items.slice(0, INFINITE_SCROLL_PAGE_SIZE))
    expect(slicePage(items, 2, 101)).toEqual(items.slice(INFINITE_SCROLL_PAGE_SIZE))
  })

  it('orders rows by id list and skips missing ids', () => {
    expect(orderRowsByIds(
      [{id: 2, name: 'b'}, {id: '1', name: 'a'}],
      [1, 3, 2],
    )).toEqual([{id: '1', name: 'a'}, {id: 2, name: 'b'}])
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
