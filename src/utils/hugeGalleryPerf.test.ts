import { describe, expect, it } from 'vitest'
import {
  INFINITE_SCROLL_MAX_ITEMS,
  trimInfiniteScrollItems,
} from '@shared/listPagination'
import {
  shouldUseVirtualGrid,
  shouldUseVirtualMasonry,
  VIRTUAL_GRID_THRESHOLD,
} from './gridLayout'

/**
 * Synthetic QA gates for huge image galleries (5k–10k scale).
 * Manual checklist: card view scroll, masonry with dims, viewer filmstrip, flag off.
 */
describe('huge gallery performance gates', () => {
  it('raises the infinite-scroll data window above the old 500 cap', () => {
    expect(INFINITE_SCROLL_MAX_ITEMS).toBeGreaterThanOrEqual(1500)
    expect(INFINITE_SCROLL_MAX_ITEMS).toBeLessThanOrEqual(3000)

    const items = Array.from({length: INFINITE_SCROLL_MAX_ITEMS + 50}, (_, i) => i)
    const trimmed = trimInfiniteScrollItems(items)
    expect(trimmed.items).toHaveLength(INFINITE_SCROLL_MAX_ITEMS)
    expect(trimmed.trimmedFromTop).toBe(50)
  })

  it('enables virtual card grid at library scale', () => {
    expect(shouldUseVirtualGrid(5_000, true, 'media')).toBe(true)
    expect(shouldUseVirtualGrid(10_000, true, 'media')).toBe(true)
    expect(shouldUseVirtualGrid(VIRTUAL_GRID_THRESHOLD - 1, true, 'media')).toBe(false)
    expect(shouldUseVirtualGrid(5_000, true, 'media', {enabled: false})).toBe(false)
  })

  it('enables virtual masonry only with stable dimensions at scale', () => {
    const sized = Array.from({length: 5_000}, (_, id) => ({
      id,
      width: 1200,
      height: 800,
    }))
    const sparse = sized.map((item, index) => (
      index % 10 === 0 ? item : {...item, width: 0, height: 0}
    ))

    expect(shouldUseVirtualMasonry(sized.length, true, 'media', {items: sized})).toBe(true)
    expect(shouldUseVirtualMasonry(sparse.length, true, 'media', {items: sparse})).toBe(false)
  })
})
