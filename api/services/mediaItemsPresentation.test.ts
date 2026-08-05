import {describe, expect, it} from 'vitest'
import {
  createItemShell,
  pushUniqueTagLink,
  toNavigationItem,
  usesVisualNearDuplicates,
  type MediaTagLinkRow,
} from './mediaItemsPresentation'

describe('mediaItemsPresentation', () => {
  it('dedupes tag links and marks folder inheritance', () => {
    const map = new Map<number, MediaTagLinkRow[]>()
    pushUniqueTagLink(map, 1, 10, 2)
    pushUniqueTagLink(map, 1, 10, 2)
    pushUniqueTagLink(map, 1, 11, 2, true)
    pushUniqueTagLink(map, Number.NaN, 10, 2)
    expect(map.get(1)).toEqual([
      {tagId: 10, metaId: 2},
      {tagId: 11, metaId: 2, fromFolder: true},
    ])
  })

  it('detects visual near-duplicate modes', () => {
    expect(usesVisualNearDuplicates({find_duplicates: true, duplicates_by: 'visualHash'})).toBe(true)
    expect(usesVisualNearDuplicates({find_duplicates: true, duplicates_by: 'visual'})).toBe(true)
    expect(usesVisualNearDuplicates({find_duplicates: true, duplicates_by: 'visualHashNear'})).toBe(true)
    expect(usesVisualNearDuplicates({find_duplicates: true, duplicates_by: 'hash'})).toBe(false)
    expect(usesVisualNearDuplicates({find_duplicates: false, duplicates_by: 'visual'})).toBe(false)
  })

  it('whitelists navigation fields and builds item shells', () => {
    const item = {
      id: 7,
      path: '/a.mp4',
      name: 'a.mp4',
      basename: 'a',
      ext: 'mp4',
      mediaTypeId: 1,
      filesize: 100,
      width: 10,
      height: 20,
      duration: 3,
      rating: 4,
      favorite: true,
      views: 2,
      viewedAt: '2020',
      time: 1,
      codec: 'h264',
      extra: 'drop-me',
    }
    expect(toNavigationItem(item)).toEqual({
      id: 7,
      path: '/a.mp4',
      name: 'a.mp4',
      basename: 'a',
      ext: 'mp4',
      mediaTypeId: 1,
      filesize: 100,
      width: 10,
      height: 20,
      duration: 3,
      rating: 4,
      favorite: true,
      views: 2,
      viewedAt: '2020',
      time: 1,
    })
    expect(createItemShell({id: 9, name: 'x'})).toEqual({
      id: 9,
      name: 'x',
      tags: [],
      values: [],
      key: '9',
    })
  })
})
