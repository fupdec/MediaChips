import {describe, expect, it} from 'vitest'
import {
  getPinnedAssignmentOrder,
  groupByPinnedAssignmentOrder,
  sortByPinnedAssignmentOrder,
  sortPinnedAssignmentItems,
} from './pinnedMetaOrder'

describe('sortPinnedAssignmentItems', () => {
  it('sorts by order then meta name without mutating input', () => {
    const items = [
      {order: 2, meta: {name: 'B'}},
      {order: 1, meta: {name: 'C'}},
      {order: 1, meta: {name: 'A'}},
    ]
    const copy = [...items]
    expect(sortPinnedAssignmentItems(items).map((i) => i.meta?.name)).toEqual(['A', 'C', 'B'])
    expect(items).toEqual(copy)
  })

  it('treats missing/NaN order as 0 and handles empty input', () => {
    expect(sortPinnedAssignmentItems([
      {order: Number.NaN, meta: {name: 'Z'}},
      {meta: {name: 'A'}},
      {order: 1, meta: {name: 'M'}},
    ]).map((i) => i.meta?.name)).toEqual(['A', 'Z', 'M'])
    expect(sortPinnedAssignmentItems()).toEqual([])
  })
})

describe('getPinnedAssignmentOrder', () => {
  const assigned = [
    {metaId: 2, pinnedMetaId: 20, order: 5},
    {metaId: 3, pinnedMetaId: 30, order: Number.NaN},
  ]

  it('matches metaId by default', () => {
    expect(getPinnedAssignmentOrder(assigned, 2)).toBe(5)
    expect(getPinnedAssignmentOrder(assigned, '2')).toBe(5)
  })

  it('can match pinnedMetaId', () => {
    expect(getPinnedAssignmentOrder(assigned, 20, {usePinnedMetaId: true})).toBe(5)
  })

  it('returns MAX_SAFE_INTEGER for missing or non-finite order', () => {
    expect(getPinnedAssignmentOrder(assigned, 99)).toBe(Number.MAX_SAFE_INTEGER)
    expect(getPinnedAssignmentOrder(assigned, 3)).toBe(Number.MAX_SAFE_INTEGER)
    expect(getPinnedAssignmentOrder(null, 1)).toBe(Number.MAX_SAFE_INTEGER)
  })
})

describe('sortByPinnedAssignmentOrder', () => {
  it('orders assigned items first, then by name', () => {
    const assigned = [
      {metaId: 1, order: 2},
      {metaId: 2, order: 1},
    ]
    const items = [
      {id: 1, name: 'Z'},
      {id: 2, name: 'A'},
      {id: 3, name: 'M'},
    ]
    expect(sortByPinnedAssignmentOrder(items, assigned, (item) => item.id).map((i) => i.name))
      .toEqual(['A', 'Z', 'M'])
  })
})

describe('groupByPinnedAssignmentOrder', () => {
  it('orders groups by assignment then sorts items by name', () => {
    const assigned = [
      {metaId: 2, order: 1},
      {metaId: 1, order: 2},
    ]
    const grouped = {
      '1': [{name: 'B'}, {name: 'A'}],
      '2': [{name: 'D'}, {name: 'C'}],
      '9': [{name: 'Z'}],
    }
    const groups = groupByPinnedAssignmentOrder(grouped, assigned)
    expect(groups.map((g) => g.map((i) => i.name))).toEqual([
      ['C', 'D'],
      ['A', 'B'],
      ['Z'],
    ])
  })

  it('supports getGroupMetaId and usePinnedMetaId', () => {
    const assigned = [{pinnedMetaId: 50, order: 1}]
    const grouped = {
      g1: [{name: 'A'}],
      g2: [{name: 'B'}],
    }
    const groups = groupByPinnedAssignmentOrder(grouped, assigned, {
      usePinnedMetaId: true,
      getGroupMetaId: (key) => (key === 'g2' ? 50 : 1),
    })
    expect(groups.map((g) => g[0].name)).toEqual(['B', 'A'])
  })
})
