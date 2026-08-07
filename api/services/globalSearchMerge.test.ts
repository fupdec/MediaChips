import {describe, expect, it} from 'vitest'
import {
  combineMediaMatchSources,
  combineTagMatchSources,
  escapeLikePattern,
  mergeMediaSearchRows,
  mergeTagSearchRows,
  normalizeSearchLimit,
  normalizeSearchTagIds,
} from './globalSearchMerge'

describe('globalSearchMerge', () => {
  it('escapes LIKE wildcards and clamps limits', () => {
    expect(escapeLikePattern('a%b_c\\d')).toBe('a\\%b\\_c\\\\d')
    expect(normalizeSearchLimit(0)).toBe(50)
    expect(normalizeSearchLimit(999)).toBe(200)
    expect(normalizeSearchLimit(12.7)).toBe(12)
  })

  it('normalizes positive tag ids', () => {
    expect(normalizeSearchTagIds('1')).toEqual([])
    expect(normalizeSearchTagIds([1, '2', 2, 0, -3])).toEqual([1, 2])
  })

  it('combines match sources', () => {
    expect(combineTagMatchSources('name', 'synonym')).toBe('both')
    expect(combineMediaMatchSources('name', 'name')).toBe('name')
    expect(combineMediaMatchSources(undefined, 'bookmark')).toBe('bookmark')
    expect(combineMediaMatchSources('name', 'content')).toBe('both')
  })

  it('merges tag and media search rows with limit', () => {
    const tags = mergeTagSearchRows(
      [{id: 1, name: 'A', metaId: 1, matchSource: 'name'}],
      [
        {id: 1, name: 'A', metaId: 1, matchSource: 'bookmark', matchedBookmark: 'x'},
        {id: 2, name: 'B', metaId: 1, matchSource: 'name'},
      ],
      10,
    )
    expect(tags).toHaveLength(2)
    expect(tags[0]).toMatchObject({id: 1, matchSource: 'both', matchedBookmark: 'x'})

    const media = mergeMediaSearchRows(
      [{id: 1, name: 'm', matchSource: 'name'}],
      [{id: 1, name: 'm', matchSource: 'tag', matchedTags: [{id: 9, name: 't'}]}],
      10,
    )
    expect(media).toHaveLength(1)
    expect(media[0]?.matchSource).toBe('both')
    expect(media[0]?.matchedTags).toEqual([{id: 9, name: 't'}])

    const withContent = mergeMediaSearchRows(
      [{id: 1, name: 'm', matchSource: 'name'}],
      [{id: 1, name: 'm', matchSource: 'content', matchedContent: '…hello…'}],
      10,
    )
    expect(withContent[0]?.matchedContent).toBe('…hello…')
    expect(withContent[0]?.matchSource).toBe('both')
  })
})
