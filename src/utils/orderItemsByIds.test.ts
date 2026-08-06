/**
 * @vitest-environment node
 */
import {describe, expect, it} from 'vitest'
import {orderItemsByIds} from '@/utils/orderItemsByIds'

describe('orderItemsByIds', () => {
  it('reorders items to match id list', () => {
    const items = [{id: 3}, {id: 1}, {id: 2}]
    expect(orderItemsByIds(items, [1, 2, 3]).map((item) => item.id)).toEqual([1, 2, 3])
  })

  it('keeps unknown items after ranked ones', () => {
    const items = [{id: 9}, {id: 1}, {id: 2}]
    expect(orderItemsByIds(items, [2, 1]).map((item) => item.id)).toEqual([2, 1, 9])
  })
})
