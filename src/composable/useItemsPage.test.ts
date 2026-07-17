import {describe, it, expect} from 'vitest'
import {getNextInfiniteMediaPage, INFINITE_PAGE_SIZE} from '@/composable/useItemsPage'

describe('useItemsPage helpers', () => {
  it('returns the next page after the current page index', () => {
    expect(getNextInfiniteMediaPage(0)).toBe(2)
    expect(getNextInfiniteMediaPage(1)).toBe(2)
    expect(getNextInfiniteMediaPage(2)).toBe(3)
    expect(getNextInfiniteMediaPage(20)).toBe(21)
  })

  it('keeps infinite page size at 25', () => {
    expect(INFINITE_PAGE_SIZE).toBe(25)
  })
})
