import {describe, expect, it} from 'vitest'
import {
  fileExtension,
  isAddableBrowseFile,
  markEntriesInLibrary,
  resolveParentPath,
} from './browseDirectoryMatch'

describe('browseDirectoryMatch', () => {
  it('resolves parents within media roots', () => {
    expect(resolveParentPath('/media/a/b', '/media', '/media')).toBe('/media/a')
    expect(resolveParentPath('/media', '/media', '/media')).toBeNull()
  })

  it('computes extensions and addable flags', () => {
    expect(fileExtension('clip.MP4')).toBe('mp4')
    expect(fileExtension('readme')).toBeNull()
    expect(isAddableBrowseFile(true, 'mp4', new Set(['mp4']))).toBe(true)
    expect(isAddableBrowseFile(true, 'txt', new Set(['mp4']))).toBe(false)
    expect(isAddableBrowseFile(true, 'txt', new Set())).toBe(true)
  })

  it('marks library hits and disables addable', () => {
    const entries = [
      {
        path: '/media/a.mp4',
        isDirectory: false,
        inLibrary: false,
        addable: true,
        mediaId: null,
      },
    ]
    markEntriesInLibrary(entries, {
      findByPaths: () => [{id: 7, path: '/media/a.mp4'}],
    })
    expect(entries[0]).toMatchObject({
      inLibrary: true,
      addable: false,
      mediaId: 7,
    })
  })
})
