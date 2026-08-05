import {afterEach, describe, expect, it} from 'vitest'
import {
  clearVisibleItemIds,
  markItemHidden,
  markItemVisible,
  setVisibleItemIds,
  visibleItemIds,
} from './visibleItemsWindow'

describe('visibleItemsWindow', () => {
  afterEach(() => {
    clearVisibleItemIds()
  })

  it('tracks visible ids uniquely', () => {
    markItemVisible(1)
    markItemVisible('1')
    markItemVisible(2)
    expect(visibleItemIds.value).toEqual([1, 2])

    markItemHidden(1)
    expect(visibleItemIds.value).toEqual([2])
  })

  it('replaces the set via setVisibleItemIds', () => {
    setVisibleItemIds([3, 'x', 4])
    expect(visibleItemIds.value).toEqual([3, 4])
    clearVisibleItemIds()
    expect(visibleItemIds.value).toEqual([])
  })
})
