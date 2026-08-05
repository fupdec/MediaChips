import {describe, expect, it} from 'vitest'
import {
  buildExistingNameIndex,
  detectTagNameConflicts,
  groupTagIdsByNormalizedName,
  orderMergeGroup,
} from './tagNameConflictDetect'

const normalize = (name: string | null | undefined) => String(name || '').trim().toLowerCase()

describe('tagNameConflictDetect', () => {
  it('indexes existing names and detects conflicts', () => {
    const index = buildExistingNameIndex(
      [{id: 1, name: 'Alice'}, {id: 2, name: 'Bob'}, {id: 3, name: 'alice'}],
      new Set([9]),
      normalize,
    )
    expect(index.get('alice')).toBe(1)
    expect(detectTagNameConflicts(
      [
        {tagId: 10, name: 'Alice', key: 'alice'},
        {tagId: 11, name: 'Carol', key: 'carol'},
      ],
      index,
    )).toEqual([{tagId: 10, name: 'Alice', existingTagId: 1}])
  })

  it('groups and orders merge candidates', () => {
    const groups = groupTagIdsByNormalizedName(
      [{id: 5, name: 'Real'}, {id: 2, name: 'real'}, {id: 7, name: 'Other'}],
      normalize,
    )
    expect(groups.get('real')).toEqual([5, 2])
    expect(orderMergeGroup([5, 2], new Set([2]))).toEqual([2, 5])
  })
})
