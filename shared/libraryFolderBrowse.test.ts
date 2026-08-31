import {describe, expect, it} from 'vitest'
import {
  buildLibraryFolderBreadcrumbs,
  immediateChildFolderPath,
  isDirectLibraryFolderChild,
  libraryFolderDisplayName,
  libraryFolderParentPath,
  normalizeLibraryFolderPath,
} from './libraryFolderBrowse'

describe('normalizeLibraryFolderPath', () => {
  it('converts backslashes and strips trailing slashes', () => {
    expect(normalizeLibraryFolderPath('C:\\Videos\\Action\\')).toBe('C:/Videos/Action')
    expect(normalizeLibraryFolderPath('/media/videos/')).toBe('/media/videos')
  })

  it('keeps Windows drive roots as C:/', () => {
    expect(normalizeLibraryFolderPath('C:\\')).toBe('C:/')
    expect(normalizeLibraryFolderPath('c:')).toBe('C:/')
  })
})

describe('libraryFolderParentPath', () => {
  it('returns null at disk roots', () => {
    expect(libraryFolderParentPath('/Volumes/Disk')).toBeNull()
    expect(libraryFolderParentPath('C:\\')).toBeNull()
    expect(libraryFolderParentPath('/Users')).toBeNull()
  })

  it('walks up nested folders', () => {
    expect(libraryFolderParentPath('/Volumes/Disk/Movies/Action')).toBe('/Volumes/Disk/Movies')
    expect(libraryFolderParentPath('/Volumes/Disk/Movies')).toBe('/Volumes/Disk')
    expect(libraryFolderParentPath('C:\\Videos\\Action')).toBe('C:/Videos')
  })
})

describe('buildLibraryFolderBreadcrumbs', () => {
  it('builds crumbs from disk root', () => {
    expect(buildLibraryFolderBreadcrumbs('/Volumes/Disk/Movies/Action')).toEqual([
      {path: '/Volumes/Disk', name: 'Disk'},
      {path: '/Volumes/Disk/Movies', name: 'Movies'},
      {path: '/Volumes/Disk/Movies/Action', name: 'Action'},
    ])
  })
})

describe('libraryFolderDisplayName', () => {
  it('uses last segment and drive label', () => {
    expect(libraryFolderDisplayName('/media/videos')).toBe('videos')
    expect(libraryFolderDisplayName('C:\\')).toBe('C:')
    expect(libraryFolderDisplayName('/Volumes/Disk')).toBe('Disk')
  })
})

describe('immediateChildFolderPath / isDirectLibraryFolderChild', () => {
  it('detects direct files vs nested folders', () => {
    expect(isDirectLibraryFolderChild('/media/videos', '/media/videos/a.mp4')).toBe(true)
    expect(isDirectLibraryFolderChild('/media/videos', '/media/videos/Action/a.mp4')).toBe(false)
    expect(immediateChildFolderPath('/media/videos', '/media/videos/Action/a.mp4'))
      .toBe('/media/videos/Action')
    expect(immediateChildFolderPath('/media/videos', '/media/videos/a.mp4')).toBeNull()
  })

  it('skips zip virtual paths as folders', () => {
    expect(immediateChildFolderPath(
      '/media',
      '/media/gallery.zip!/nested/entry.jpg',
    )).toBeNull()
    expect(isDirectLibraryFolderChild(
      '/media',
      '/media/gallery.zip!/entry.jpg',
    )).toBe(false)
  })
})
