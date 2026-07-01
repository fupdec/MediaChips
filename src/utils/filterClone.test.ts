import {describe, expect, it} from 'vitest'
import {cloneFilters, filtersEqual} from '@/utils/filterClone'
import type {FilterObject} from '@/types/common'

describe('filterClone', () => {
  it('clones filter rows without sharing nested values', () => {
    const filters: FilterObject[] = [
      {id: 1, param: 'name', type: 'string', cond: 'includes', val: ['foo'], note: null, active: true, lock: false, removed: false},
      {id: 2, param: 'rating', type: 'number', cond: 'more', val: {min: 1}, note: null, active: true, lock: false, removed: false},
    ]

    const cloned = cloneFilters(filters)
    expect(cloned).toEqual(filters)
    expect(cloned).not.toBe(filters)
    expect(cloned[0].val).not.toBe(filters[0].val)
    expect(cloned[1].val).not.toBe(filters[1].val)

    ;(cloned[0].val as string[]).push('bar')
    expect(filters[0].val).toEqual(['foo'])
  })

  it('compares filters by value', () => {
    const left: FilterObject[] = [
      {id: 1, param: 'name', type: 'string', cond: 'includes', val: ['a'], note: null, active: true, lock: false, removed: false},
    ]
    const right: FilterObject[] = [
      {id: 1, param: 'name', type: 'string', cond: 'includes', val: ['a'], note: null, active: true, lock: false, removed: false},
    ]

    expect(filtersEqual(left, right)).toBe(true)
    expect(filtersEqual(left, cloneFilters(right))).toBe(true)
    expect(filtersEqual(left, [{...left[0], val: ['b']}]))
  })
})
