import {describe, expect, it} from 'vitest'
import {cloneItemsStoreFieldValue} from '@/stores/itemsStoreClone'

describe('itemsStoreClone', () => {
  it('clones filters without sharing array references', () => {
    const filters = [{id: 1, param: 'name', type: 'string', cond: 'includes', val: ['a'], note: null, active: true, lock: false}]
    const cloned = cloneItemsStoreFieldValue('filters', filters) as typeof filters

    expect(cloned).toEqual(filters)
    expect(cloned).not.toBe(filters)
    expect(cloned[0].val).not.toBe(filters[0].val)
  })

  it('clones primitive arrays by value', () => {
    const selection = [1, 2, 3]
    const cloned = cloneItemsStoreFieldValue('selection', selection) as number[]

    cloned.push(4)
    expect(selection).toEqual([1, 2, 3])
  })
})
