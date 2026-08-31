import {describe, expect, it} from 'vitest'
import {
  canNestCategoryUnder,
  canReparentCategory,
  categoryPathLabel,
  flattenTagCategories,
  hasEmptyCategoryNestTarget,
  isTagCategoryGroup,
  isTagCategoryLeaf,
  leafCategoryOptions,
} from './tagCategoryTree'

describe('tagCategoryTree', () => {
  it('rejects nesting a category under itself or a descendant', () => {
    const metas = [
      {id: 1, name: 'People', type: 'array' as const, parentMetaId: null, hidden: false, order: 0, icon: 'account'},
      {id: 2, name: 'Hair', type: 'array' as const, parentMetaId: 1, hidden: false, order: 0, icon: 'hair-dryer'},
    ]
    expect(canReparentCategory(1, 2, metas, 0)).toBe(false)
    expect(canReparentCategory(1, 1, metas, 0)).toBe(false)
    expect(canReparentCategory(2, null, metas, 0)).toBe(true)
  })

  it('treats categories with children as groups', () => {
    const metas = [
      {id: 1, name: 'People', type: 'array' as const, parentMetaId: null, hidden: false, order: 0, icon: 'account'},
      {id: 2, name: 'Hair', type: 'array' as const, parentMetaId: 1, hidden: false, order: 0, icon: 'hair-dryer'},
    ]
    expect(isTagCategoryGroup(metas[0], metas)).toBe(true)
    expect(isTagCategoryLeaf(metas[0], metas)).toBe(false)
    expect(isTagCategoryLeaf(metas[1], metas)).toBe(true)
    expect(leafCategoryOptions(metas).map((item) => item.id)).toEqual([2])
    expect(canNestCategoryUnder(metas[0], metas, 4)).toBe(true)
    expect(canNestCategoryUnder(metas[1], metas, 4)).toBe(false)
    expect(canNestCategoryUnder(metas[1], metas, 0)).toBe(true)
    expect(flattenTagCategories(metas).map((row) => [row.meta.id, row.depth, row.isGroup])).toEqual([
      [1, 0, true],
      [2, 1, false],
    ])
  })

  it('hides category nest-drag when every leaf has tags and nothing is a group', () => {
    const leaves = [
      {id: 1, name: 'Girls', type: 'array' as const, parentMetaId: null, hidden: false, order: 0, icon: 'account'},
      {id: 2, name: 'Tags', type: 'array' as const, parentMetaId: null, hidden: false, order: 1, icon: 'tag'},
    ]
    expect(hasEmptyCategoryNestTarget(leaves, {1: 10, 2: 4})).toBe(false)
    expect(hasEmptyCategoryNestTarget(leaves, {1: 10, 2: 0})).toBe(true)
    expect(hasEmptyCategoryNestTarget(
      [
        {id: 1, name: 'People', type: 'array' as const, parentMetaId: null, hidden: false, order: 0, icon: 'account'},
        {id: 2, name: 'Hair', type: 'array' as const, parentMetaId: 1, hidden: false, order: 0, icon: 'hair-dryer'},
      ],
      {1: 0, 2: 8},
    )).toBe(true)
  })

  it('builds nested picker labels from names and never falls back to ids', () => {
    const nested = [
      {id: 1, name: 'People', type: 'array' as const, parentMetaId: null, hidden: false, order: 0, icon: 'account'},
      {id: 2, name: 'Hair', type: 'array' as const, parentMetaId: 1, hidden: false, order: 0, icon: 'hair-dryer'},
    ]
    expect(categoryPathLabel(2, nested)).toBe('People › Hair')
    expect(leafCategoryOptions(nested)[0].pickerTitle).toBe('People › Hair')

    const danglingParent = [
      {id: 5, name: 'Tags', type: 'array' as const, parentMetaId: 28, hidden: false, order: 0, icon: 'tag'},
    ]
    expect(categoryPathLabel(5, danglingParent)).toBe('Tags')
    expect(leafCategoryOptions(danglingParent)[0].pickerTitle).toBe('Tags')

    const unnamedParent = [
      {id: 28, name: '  ', type: 'array' as const, parentMetaId: null, hidden: false, order: 0, icon: 'folder'},
      {id: 5, name: 'Tags', type: 'array' as const, parentMetaId: 28, hidden: false, order: 0, icon: 'tag'},
    ]
    expect(categoryPathLabel(5, unnamedParent)).toBe('Tags')
  })
})
