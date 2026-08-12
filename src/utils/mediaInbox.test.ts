import {describe, expect, it} from 'vitest'
import {
  basenameFromInboxPath,
  collectMediaInboxLostItems,
  collectMediaInboxNewItems,
  countMediaInboxLost,
  countMediaInboxNew,
  groupMediaInboxNewItems,
  normalizeMediaInboxPath,
} from './mediaInbox'
import type {WatcherFilesEntry} from '@/types/watcher'

const entries: WatcherFilesEntry[] = [
  {
    folder: {id: 1, name: 'Movies', path: '/media/Movies'},
    files: [
      {
        type: {id: 10, name: 'Video', icon: 'video'},
        new: ['/media/Movies/a.mp4', '/media/Movies/b.mp4'],
        lost: [{id: 99, path: '/media/Movies/gone.mp4'}],
      },
    ],
  },
  {
    folder: {id: 2, name: 'Photos', path: '/media/Photos'},
    files: [
      {
        type: {id: 20, name: 'Image', icon: 'image'},
        new: ['/media/Photos/c.jpg'],
        lost: [],
      },
    ],
  },
]

describe('mediaInbox utils', () => {
  it('collects and groups new files across folders', () => {
    const items = collectMediaInboxNewItems(entries)
    expect(items).toHaveLength(3)
    expect(countMediaInboxNew(entries)).toBe(3)

    const groups = groupMediaInboxNewItems(items)
    expect(groups).toHaveLength(2)
    expect(groups[0].items).toHaveLength(2)
    expect(groups[1].mediaTypeId).toBe(20)
  })

  it('filters ignored paths case-insensitively', () => {
    const ignored = [normalizeMediaInboxPath('/media/Movies/A.mp4')]
    expect(countMediaInboxNew(entries, ignored)).toBe(2)
    expect(collectMediaInboxNewItems(entries, ignored).map((i) => i.path)).toEqual([
      '/media/Movies/b.mp4',
      '/media/Photos/c.jpg',
    ])
  })

  it('collects lost files and basenames', () => {
    expect(countMediaInboxLost(entries)).toBe(1)
    expect(collectMediaInboxLostItems(entries)[0]).toMatchObject({
      id: 99,
      path: '/media/Movies/gone.mp4',
      folderName: 'Movies',
    })
    expect(basenameFromInboxPath('/foo/bar/Baz.MP4')).toBe('Baz.MP4')
  })
})
