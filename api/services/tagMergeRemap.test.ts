import {describe, expect, it} from 'vitest'
import {
  planNestedNameDedupeDeletes,
  planTagValuesToInsert,
  remapFilterRowLinksToSurvivor,
  remapFolderLinksToSurvivor,
  remapMediaLinksToSurvivor,
  remapNestedChildLinksToSurvivor,
  remapNestedParentLinksToSurvivor,
} from './tagMergeRemap'

describe('tagMergeRemap', () => {
  it('remaps media/folder links onto survivor and dedupes', () => {
    expect(remapMediaLinksToSurvivor([
      {mediaId: 1, tagId: 9, metaId: 2},
      {mediaId: 1, tagId: 8, metaId: 2},
    ], 5)).toEqual([{mediaId: 1, tagId: 5, metaId: 2}])

    expect(remapFolderLinksToSurvivor([
      {folderId: 3, tagId: 9, metaId: 2},
    ], 5)).toEqual([{folderId: 3, tagId: 5, metaId: 2}])
  })

  it('filters self-links when remapping nested tags', () => {
    expect(remapNestedChildLinksToSurvivor([
      {parentTagId: 5, tagId: 9, metaId: 2},
      {parentTagId: 1, tagId: 9, metaId: 2},
    ], 5)).toEqual([{parentTagId: 1, tagId: 5, metaId: 2}])

    expect(remapNestedParentLinksToSurvivor([
      {parentTagId: 9, tagId: 5, metaId: 2},
      {parentTagId: 9, tagId: 7, metaId: 2},
    ], 5)).toEqual([{parentTagId: 5, tagId: 7, metaId: 2}])
  })

  it('plans unique meta values and nested name deletes', () => {
    expect(planTagValuesToInsert(
      [
        {metaId: 1, value: 'a'},
        {metaId: 2, value: 'b'},
        {metaId: 2, value: 'c'},
      ],
      5,
      new Set([1]),
    )).toEqual([{tagId: 5, metaId: 2, value: 'b'}])

    expect(remapFilterRowLinksToSurvivor(
      [{tagId: 9, rowId: 1, metaId: 2}],
      5,
    )).toEqual([{tagId: 5, rowId: 1, metaId: 2}])

    const deletes = planNestedNameDedupeDeletes(
      [
        {parentTagId: 1, tagId: 10, metaId: 2},
        {parentTagId: 1, tagId: 11, metaId: 2},
        {parentTagId: 1, tagId: 12, metaId: 2},
      ],
      new Map([[10, 'real'], [11, 'real'], [12, 'other']]),
      new Set([11]),
    )
    expect(deletes).toEqual([{parentTagId: 1, tagId: 10, metaId: 2}])
  })
})
