import { describe, expect, it } from 'vitest'
import {
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
    const items = Array.from({ length: 300 }, (_, index) => index + 1)

    const result = trimInfiniteScrollItems(items)
    expect(result.items).toHaveLength(250)
    expect(result.trimmedFromTop).toBe(50)
    expect(result.items[0]).toBe(51)
    expect(result.items[249]).toBe(300)
  })
})
