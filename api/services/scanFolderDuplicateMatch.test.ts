import {describe, expect, it} from 'vitest'
import {
  buildWithinFolderSizeGroups,
  confirmWithinFolderByFingerprint,
  dedupeInLibraryHits,
  groupScannedFilesBySize,
  selectDuplicateCandidatePaths,
} from './scanFolderDuplicateMatch'

describe('scanFolderDuplicateMatch', () => {
  const files = [
    {path: '/a/1.mp4', basename: '1.mp4', filesize: 100},
    {path: '/a/2.mp4', basename: '2.mp4', filesize: 100},
    {path: '/a/3.mp4', basename: '3.mp4', filesize: 50},
  ]

  it('groups by size and builds size-only duplicate groups', () => {
    const bySize = groupScannedFilesBySize(files)
    expect(bySize.get(100)).toHaveLength(2)
    expect(buildWithinFolderSizeGroups(bySize)).toEqual([
      {filesize: 100, paths: ['/a/1.mp4', '/a/2.mp4']},
    ])
  })

  it('selects candidates from size groups and library basename hits', () => {
    const bySize = groupScannedFilesBySize(files)
    const library = new Map([
      ['50::3.mp4', [{id: 9, path: '/lib/3.mp4'}]],
    ])
    const candidates = selectDuplicateCandidatePaths(files, bySize, library)
    expect([...candidates].sort()).toEqual(['/a/1.mp4', '/a/2.mp4', '/a/3.mp4'])
  })

  it('selects a single renamed file solely by its size in the library', () => {
    const renamed = [{path: '/disk/renamed.mp4', basename: 'renamed.mp4', filesize: 12345}]
    expect([...selectDuplicateCandidatePaths(renamed, groupScannedFilesBySize(renamed), new Map(),
      new Map([[12345, [{id: 1, path: '/library/original.mp4'}]]]))]).toEqual(['/disk/renamed.mp4'])
    expect([...selectDuplicateCandidatePaths(renamed, groupScannedFilesBySize(renamed), new Map(),
      new Map([[12345, [{id: 1, path: '/disk/renamed.mp4'}]]]))]).toEqual([])
  })

  it('confirms within-folder groups by fingerprint and dedupes library hits', () => {
    const bySize = groupScannedFilesBySize(files)
    const fps = new Map([
      ['/a/1.mp4', {kind: 'oshash', value: 'abc'}],
      ['/a/2.mp4', {kind: 'oshash', value: 'abc'}],
    ])
    expect(confirmWithinFolderByFingerprint(bySize, fps)).toEqual([
      {filesize: 100, paths: ['/a/1.mp4', '/a/2.mp4'], kind: 'oshash', value: 'abc'},
    ])

    expect(dedupeInLibraryHits([
      {path: '/a/1.mp4', libraryPath: '/lib/1.mp4', libraryId: 1, parameter: 'oshash'},
      {path: '/a/1.mp4', libraryPath: '/lib/1.mp4', libraryId: 1, parameter: 'oshash'},
    ])).toHaveLength(1)
  })
})
