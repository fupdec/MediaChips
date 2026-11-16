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
  it('keeps a bounded infinite-scroll DOM window', () => {
    expect(INFINITE_SCROLL_MAX_ITEMS).toBeGreaterThanOrEqual(80)
    expect(INFINITE_SCROLL_MAX_ITEMS).toBeLessThanOrEqual(200)

    const items = Array.from({length: INFINITE_SCROLL_MAX_ITEMS + 50}, (_, i) => i)
    const trimmed = trimInfiniteScrollItems(items)
    expect(trimmed.items).toHaveLength(INFINITE_SCROLL_MAX_ITEMS)
    expect(trimmed.trimmedFromTop).toBe(50)
  })

  it('virtualizes infinite card grids from the first item', () => {
    expect(shouldUseVirtualGrid(1, true, 'media')).toBe(true)
    expect(shouldUseVirtualGrid(5_000, true, 'media')).toBe(true)
    expect(shouldUseVirtualGrid(VIRTUAL_GRID_THRESHOLD - 1, false, 'media')).toBe(false)
    expect(shouldUseVirtualGrid(VIRTUAL_GRID_THRESHOLD, false, 'media')).toBe(true)
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
