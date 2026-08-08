import { describe, expect, it } from 'vitest'
import {
  getInfinitePageForIndex,
  resolveScrollTopForIndex,
  resolveVirtualScrollTargetIndex,
  shouldJumpInfiniteWindow,
  shouldRecoverEmptyViewport,
  INFINITE_PAGE_SIZE,
  INFINITE_JUMP_AHEAD_PAGES,
} from '@/composable/useItemsPage'

describe('infinite scroll jump helpers', () => {
  it('maps absolute indexes to 1-based pages', () => {
    expect(getInfinitePageForIndex(0)).toBe(1)
    expect(getInfinitePageForIndex(INFINITE_PAGE_SIZE - 1)).toBe(1)
    expect(getInfinitePageForIndex(INFINITE_PAGE_SIZE)).toBe(2)
    expect(getInfinitePageForIndex(589)).toBe(Math.floor(589 / INFINITE_PAGE_SIZE) + 1)
  })

  it('keeps near-end appends sequential', () => {
    const windowStart = 0
    const loaded = INFINITE_PAGE_SIZE * 4
    expect(shouldJumpInfiniteWindow(loaded + 1, windowStart, loaded)).toBe(false)
    expect(
      shouldJumpInfiniteWindow(
        loaded + INFINITE_PAGE_SIZE * INFINITE_JUMP_AHEAD_PAGES - 1,
        windowStart,
        loaded,
      ),
    ).toBe(false)
  })

  it('jumps for far seeks and for targets above the trimmed window', () => {
    const windowStart = 200
    const loaded = 100
    expect(shouldJumpInfiniteWindow(50, windowStart, loaded)).toBe(true)
    expect(
      shouldJumpInfiniteWindow(
        windowStart + loaded + INFINITE_PAGE_SIZE * INFINITE_JUMP_AHEAD_PAGES,
        windowStart,
        loaded,
      ),
    ).toBe(true)
    expect(shouldJumpInfiniteWindow(windowStart + 10, windowStart, loaded)).toBe(false)
  })

  it('treats any index above the trimmed window as a jump (scroll back up)', () => {
    expect(shouldJumpInfiniteWindow(0, 900, 300)).toBe(true)
    expect(shouldJumpInfiniteWindow(899, 900, 300)).toBe(true)
  })

  it('resolves scrollbar seeks from total height ratio for variable rows', () => {
    expect(resolveVirtualScrollTargetIndex({
      focusY: 0,
      columnCount: 3,
      rowHeight: 500,
      totalHeight: 100_000,
      totalCount: 10_000,
    })).toBe(0)

    expect(resolveVirtualScrollTargetIndex({
      focusY: 50_000,
      columnCount: 3,
      rowHeight: 500,
      totalHeight: 100_000,
      totalCount: 10_000,
    })).toBe(5000)

    // Uniform fallback must not under-seek when average rowHeight is inflated.
    expect(resolveVirtualScrollTargetIndex({
      focusY: 8_000,
      columnCount: 3,
      rowHeight: 500,
    })).toBe(48)
  })

  it('uses loaded-window geometry so upward phantom seeks jump above windowStart', () => {
    // Viewport is spatially above the mounted block, but a naive height-ratio
    // would still land inside the loaded index range and skip the jump.
    expect(resolveVirtualScrollTargetIndex({
      focusY: 12_000,
      columnCount: 3,
      rowHeight: 400,
      totalHeight: 2_000_000,
      totalCount: 20_000,
      dataStartTop: 40_000,
      dataEndTop: 80_000,
      windowStart: 300,
      loadedCount: 120,
    })).toBeLessThan(300)

    expect(resolveVirtualScrollTargetIndex({
      focusY: 90_000,
      columnCount: 3,
      rowHeight: 400,
      totalHeight: 2_000_000,
      totalCount: 20_000,
      dataStartTop: 40_000,
      dataEndTop: 80_000,
      windowStart: 300,
      loadedCount: 120,
    })).toBeGreaterThanOrEqual(420)

    expect(resolveVirtualScrollTargetIndex({
      focusY: 60_000,
      columnCount: 3,
      rowHeight: 400,
      dataStartTop: 40_000,
      dataEndTop: 80_000,
      windowStart: 300,
      loadedCount: 120,
      totalCount: 20_000,
    })).toBeGreaterThanOrEqual(300)
  })

  it('uses global height ratio for far phantom seeks (no local-stride cascade)', () => {
    // Dragging from the first page to ~index 14000 must not extrapolate with the
    // short loaded-window stride (that overshoots and re-jumps several times).
    const index = resolveVirtualScrollTargetIndex({
      focusY: 1_800_000,
      columnCount: 3,
      rowHeight: 500,
      totalHeight: 2_500_000,
      totalCount: 20_000,
      dataStartTop: 0,
      dataEndTop: 20_000,
      windowStart: 0,
      loadedCount: 120,
    })
    expect(index).toBe(Math.floor((1_800_000 / 2_500_000) * 20_000))
    expect(index).toBeGreaterThan(13_000)
    expect(index).toBeLessThan(15_000)
  })

  it('maps an absolute index back to a stable scroll offset via ratio', () => {
    expect(resolveScrollTopForIndex({
      index: 14_000,
      layoutTop: 100,
      totalHeight: 2_500_000,
      totalCount: 20_000,
    })).toBe(100 + (14_000 / 20_000) * 2_500_000)
  })

  it('recovers only when loaded geometry has no mounted rows', () => {
    expect(shouldRecoverEmptyViewport({
      focusY: 400,
      dataStartTop: 0,
      dataEndTop: 8_000,
      rowCount: 0,
    })).toBe(true)

    expect(shouldRecoverEmptyViewport({
      focusY: 400,
      dataStartTop: 0,
      dataEndTop: 8_000,
      rowCount: 3,
    })).toBe(false)

    // Phantom tail / scrollbar seek — do not snap back to the window start.
    expect(shouldRecoverEmptyViewport({
      focusY: 120_000,
      dataStartTop: 0,
      dataEndTop: 8_000,
      rowCount: 0,
    })).toBe(false)
  })
})
