import {describe, expect, it} from 'vitest'
import {
  orBooleanFlags,
  remapFilterRowTagLinksMetaId,
  remapFolderTagLinksMetaId,
  remapMediaTagLinksMetaId,
  remapNestedTagLinksMetaId,
} from './tagLinkRemap'

describe('tagLinkRemap', () => {
  it('OR-merges boolean flags onto survivor', () => {
    expect(orBooleanFlags(
      {a: false, b: true},
      [{a: true, b: false}, {a: false, b: false}],
      ['a', 'b'],
    )).toEqual({a: true, b: true})
  })

  it('remaps and dedupes link rows by composite key', () => {
    expect(remapMediaTagLinksMetaId([
      {mediaId: 1, tagId: 2, metaId: 9},
      {mediaId: 1, tagId: 2, metaId: 8},
      {mediaId: 1, tagId: 3, metaId: 9},
    ], 5)).toEqual([
      {mediaId: 1, tagId: 2, metaId: 5},
      {mediaId: 1, tagId: 3, metaId: 5},
    ])

    expect(remapFolderTagLinksMetaId([
      {folderId: 1, tagId: 2, metaId: 9},
    ], 5)[0].metaId).toBe(5)

    expect(remapNestedTagLinksMetaId([
      {parentTagId: 1, tagId: 2, metaId: 9},
    ], 5)[0].metaId).toBe(5)

    expect(remapFilterRowTagLinksMetaId([
      {tagId: 2, rowId: 7, metaId: 9},
    ], 5)[0].metaId).toBe(5)
  })
})
