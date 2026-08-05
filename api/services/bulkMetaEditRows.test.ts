import {describe, expect, it} from 'vitest'
import {
  buildMediaValueRows,
  buildTagRows,
  buildTagValueRows,
  normalizePresetValue,
} from './bulkMetaEditRows'

describe('bulkMetaEditRows', () => {
  it('builds media and tag link rows', () => {
    expect(buildTagRows('media', [1], 9, [2, 3])).toEqual([
      {mediaId: 1, metaId: 9, tagId: 2},
      {mediaId: 1, metaId: 9, tagId: 3},
    ])
    expect(buildTagRows('tag', [1], 9, [2])).toEqual([
      {parentTagId: 1, metaId: 9, tagId: 2},
    ])
  })

  it('builds value rows and normalizes presets', () => {
    expect(buildMediaValueRows([1], 5, 12)).toEqual([{mediaId: 1, metaId: 5, value: '12'}])
    expect(buildTagValueRows([1], 5, null)).toEqual([{tagId: 1, metaId: 5, value: ''}])
    expect(normalizePresetValue('favorite', 1, true)).toBe(false)
    expect(normalizePresetValue('favorite', 2, '1')).toBe(true)
    expect(normalizePresetValue('rating', 2, '4')).toBe(4)
  })
})
