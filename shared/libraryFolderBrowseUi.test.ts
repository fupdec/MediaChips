import {describe, expect, it} from 'vitest'
import {
  filterAndSortFolderBrowse,
  folderTagLookupPaths,
  mergeCoverMediaIds,
} from './libraryFolderBrowseUi'

describe('filterAndSortFolderBrowse', () => {
  const folders = [
    {path: '/a/Action', name: 'Action', mediaCount: 2},
    {path: '/a/Comedy', name: 'Comedy', mediaCount: 9},
  ]
  const media = [
    {id: 1, basename: 'zeta.mp4', createdAt: '2020-01-01'},
    {id: 2, basename: 'alpha.mp4', createdAt: '2024-01-01'},
  ]

  it('filters folders and files by name', () => {
    const result = filterAndSortFolderBrowse(folders, media, {query: 'com'})
    expect(result.folders.map((f) => f.name)).toEqual(['Comedy'])
    expect(result.media).toEqual([])
  })

  it('sorts folders by count then name, files by date', () => {
    const result = filterAndSortFolderBrowse(folders, media, {sort: 'count'})
    expect(result.folders.map((f) => f.name)).toEqual(['Comedy', 'Action'])

    const byDate = filterAndSortFolderBrowse(folders, media, {sort: 'date'})
    expect(byDate.media.map((item) => item.id)).toEqual([2, 1])
  })

  it('keeps folders above files as separate lists', () => {
    const result = filterAndSortFolderBrowse(folders, media, {sort: 'name-desc'})
    expect(result.folders.map((f) => f.name)).toEqual(['Comedy', 'Action'])
    expect(result.media.map((item) => item.basename)).toEqual(['zeta.mp4', 'alpha.mp4'])
  })
})

describe('folderTagLookupPaths', () => {
  it('includes slash variants', () => {
    expect(folderTagLookupPaths('C:/Videos/Action')).toEqual([
      'C:/Videos/Action',
      'C:\\Videos\\Action',
    ])
  })
})

describe('mergeCoverMediaIds', () => {
  it('attaches up to four cover ids per folder', () => {
    const folders = mergeCoverMediaIds(
      [{path: '/a/Action', name: 'Action', mediaCount: 3, coverMediaIds: []}],
      [
        {folderKey: '/a/Action', id: 1},
        {folderKey: '/a/Action', id: 2},
        {folderKey: '/a/Action/', id: 3},
      ],
    )
    expect(folders[0]?.coverMediaIds).toEqual([1, 2, 3])
  })
})
