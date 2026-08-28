import {describe, expect, it} from 'vitest'
import {
  ancestorIds,
  breadcrumbIds,
  buildForest,
  buildParentMap,
  collectDescendantIds,
  collectSubtreeIds,
  flattenForest,
  nodeDepth,
  subtreeHeight,
  wouldCreateCycle,
  buildChildrenMap,
} from './hierarchyTree'

describe('hierarchyTree', () => {
  const parentById = buildParentMap([
    {id: 1, parentId: null},
    {id: 2, parentId: 1},
    {id: 3, parentId: 2},
    {id: 4, parentId: 1},
    {id: 5, parentId: null},
  ])
  const children = buildChildrenMap(parentById)

  it('walks ancestors and breadcrumbs', () => {
    expect(ancestorIds(3, parentById)).toEqual([2, 1])
    expect(breadcrumbIds(3, parentById)).toEqual([1, 2, 3])
    expect(nodeDepth(3, parentById)).toBe(2)
  })

  it('collects descendants and subtrees', () => {
    expect(collectDescendantIds(1, children).sort()).toEqual([2, 3, 4])
    expect(collectSubtreeIds([5, 2], children).sort()).toEqual([2, 3, 5])
    expect(subtreeHeight(1, children)).toBe(2)
    expect(subtreeHeight(5, children)).toBe(0)
  })

  it('detects cycles', () => {
    expect(wouldCreateCycle(1, 3, parentById)).toBe(true)
    expect(wouldCreateCycle(3, 5, parentById)).toBe(false)
    expect(wouldCreateCycle(1, 1, parentById)).toBe(true)
    expect(wouldCreateCycle(2, null, parentById)).toBe(false)
  })

  it('builds a forest and flattens in DFS order', () => {
    const rows = [
      {id: 2, parentId: 1, name: 'b'},
      {id: 1, parentId: null, name: 'a'},
      {id: 3, parentId: 2, name: 'c'},
    ]
    const forest = buildForest(rows, (row) => row.id, (row) => row.parentId)
    expect(forest.map((node) => node.id)).toEqual([1])
    expect(flattenForest(forest).map((node) => node.id)).toEqual([1, 2, 3])
    expect(flattenForest(forest).map((node) => node.depth)).toEqual([0, 1, 2])
  })
})
