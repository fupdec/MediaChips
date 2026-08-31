import {describe, expect, it} from 'vitest'
import {
  filterUnifiedPendingFiles,
  mergeUnifiedFolderBrowse,
  sortUnifiedPendingFiles,
} from './unifiedFolderBrowse'

const diskFolders = [
  {path: '/media/Movies', name: 'Movies'},
  {path: '/media/Empty', name: 'Empty'},
]

const diskFiles = [
  {
    path: '/media/a.mp4',
    name: 'a.mp4',
    size: 10,
    mtimeMs: 2,
    extension: 'mp4',
    inLibrary: true,
    addable: true,
    mediaId: 1,
  },
  {
    path: '/media/new.mp4',
    name: 'new.mp4',
    size: 20,
    mtimeMs: 5,
    extension: 'mp4',
    inLibrary: false,
    addable: true,
    mediaId: null,
  },
]

const libraryFolders = [
  {path: '/media/Movies', name: 'Movies', mediaCount: 12, coverMediaIds: [1, 2]},
]

const libraryMedia = [
  {id: 1, path: '/media/a.mp4', basename: 'a.mp4'},
  {id: 9, path: '/media/lost.mp4', basename: 'lost.mp4'},
]

describe('mergeUnifiedFolderBrowse', () => {
  it('overlays library stats on disk folders and splits indexed vs pending files', () => {
    const result = mergeUnifiedFolderBrowse({
      diskFolders,
      diskFiles,
      libraryFolders,
      libraryMedia,
      presence: 'all',
      includeMissing: true,
    })

    expect(result.folders.map((folder) => folder.name)).toEqual(['Movies', 'Empty'])
    expect(result.folders[0]).toMatchObject({
      mediaCount: 12,
      coverMediaIds: [1, 2],
    })
    expect(result.folders[1]?.mediaCount).toBe(0)
    expect(result.mediaIds).toEqual([1])
    expect(result.pending.map((file) => file.name)).toEqual(['new.mp4'])
    expect(result.missingMediaIds).toEqual([9])
  })

  it('hides empty folders and pending files in library filter', () => {
    const result = mergeUnifiedFolderBrowse({
      diskFolders,
      diskFiles,
      libraryFolders,
      libraryMedia,
      presence: 'library',
    })

    expect(result.folders.map((folder) => folder.name)).toEqual(['Movies'])
    expect(result.mediaIds).toEqual([1])
    expect(result.pending).toEqual([])
  })

  it('keeps only addable files not in the library for the new filter', () => {
    const result = mergeUnifiedFolderBrowse({
      diskFolders,
      diskFiles,
      libraryFolders,
      libraryMedia,
      presence: 'new',
    })

    expect(result.folders).toEqual([])
    expect(result.mediaIds).toEqual([])
    expect(result.pending.map((file) => file.path)).toEqual(['/media/new.mp4'])
    expect(result.missingMediaIds).toEqual([])
  })
})

describe('filter and sort pending files', () => {
  const files = [
    {
      name: 'zeta.mp4',
      path: '/z.mp4',
      isDirectory: false as const,
      size: 1,
      mtimeMs: 1,
      extension: 'mp4',
      inLibrary: false as const,
      addable: true,
      mediaId: null,
    },
    {
      name: 'alpha.mp4',
      path: '/a.mp4',
      isDirectory: false as const,
      size: 1,
      mtimeMs: 9,
      extension: 'mp4',
      inLibrary: false as const,
      addable: true,
      mediaId: null,
    },
  ]

  it('filters by name', () => {
    expect(filterUnifiedPendingFiles(files, 'alp').map((file) => file.name)).toEqual(['alpha.mp4'])
  })

  it('sorts by date then name', () => {
    expect(sortUnifiedPendingFiles(files, 'date').map((file) => file.name)).toEqual([
      'alpha.mp4',
      'zeta.mp4',
    ])
    expect(sortUnifiedPendingFiles(files, 'name-asc').map((file) => file.name)).toEqual([
      'alpha.mp4',
      'zeta.mp4',
    ])
  })
})
