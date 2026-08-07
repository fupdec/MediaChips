import {describe, expect, it} from 'vitest'
import {selectContiguousEntityIds} from '@/utils/itemsSelectionRange'

describe('selectContiguousEntityIds', () => {
  const entities = [{id: 10}, {id: 20}, {id: 30}, {id: 40}, {id: 50}]

  it('keeps the anchor selected when extending the range', () => {
    expect(selectContiguousEntityIds(entities, 10, 40)).toEqual([10, 20, 30, 40])
  })

  it('selects backwards from a later anchor', () => {
    expect(selectContiguousEntityIds(entities, 50, 20)).toEqual([20, 30, 40, 50])
  })

  it('selects a single item when anchor equals click', () => {
    expect(selectContiguousEntityIds(entities, 30, 30)).toEqual([30])
  })
})
