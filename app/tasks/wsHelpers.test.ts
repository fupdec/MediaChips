import { describe, it, expect } from 'vitest'
import {
  buildWatcherMasks,
  buildWatcherWatchPaths,
  foldersConfigUnchanged,
  getWatcherFoldersConfigKey,
  normalizeMoveMessageItems,
} from './wsHelpers'

describe('getWatcherFoldersConfigKey', () => {
  it('builds a stable key from folder paths and type extensions', () => {
    const folders = [
      {
        path: '/media/movies',
        types: [{id: 1, extensions: 'mp4,mkv'}],
      },
      {
        path: '/media/clips',
        types: [{id: 2, extensions: 'mp4'}],
      },
    ]

    expect(getWatcherFoldersConfigKey(folders)).toBe(getWatcherFoldersConfigKey(folders))
    expect(getWatcherFoldersConfigKey(folders)).not.toBe(
      getWatcherFoldersConfigKey([
        {
          path: '/media/movies',
          types: [{id: 1, extensions: 'avi'}],
        },
      ]),
    )
  })
})

describe('buildWatcherMasks', () => {
  it('creates recursive glob masks per folder extension', () => {
    const masks = buildWatcherMasks({
      '/media/movies': ['mp4', 'mkv'],
      '/media/clips': ['mp4'],
    })

    expect(masks).toEqual([
      '/media/movies/**/*.mp4',
      '/media/movies/**/*.mkv',
      '/media/clips/**/*.mp4',
    ])
  })
})

describe('buildWatcherWatchPaths', () => {
  it('uses folder roots for mounted volumes to avoid slow glob polling', () => {
    const extensions = {
      '/Volumes/pron/#torrents/': ['mp4', 'mkv'],
    }

    expect(buildWatcherWatchPaths(extensions, true)).toEqual([
      '/Volumes/pron/#torrents/',
    ])
    expect(buildWatcherWatchPaths(extensions, false)).toEqual([
      '/Volumes/pron/#torrents/**/*.mp4',
      '/Volumes/pron/#torrents/**/*.mkv',
    ])
  })
})

describe('normalizeMoveMessageItems', () => {
  it('prefers explicit items when provided', () => {
    const items = normalizeMoveMessageItems({
      type: 'move',
      items: [{id: 7, folder: '/dest'}],
      ids: [1, 2],
      folder: '/ignored',
    })

    expect(items).toEqual([{id: 7, folder: '/dest'}])
  })

  it('falls back to ids and folder for legacy payloads', () => {
    const items = normalizeMoveMessageItems({
      type: 'move',
      ids: [10, 11],
      folder: '/archive',
    })

    expect(items).toEqual([
      {id: 10, folder: '/archive'},
      {id: 11, folder: '/archive'},
    ])
  })

  it('returns an empty list when no items are provided', () => {
    expect(normalizeMoveMessageItems({type: 'move'})).toEqual([])
  })
})

describe('foldersConfigUnchanged', () => {
  it('detects unchanged watched folder configuration', () => {
    const folders = [
      {
        path: '/media/movies',
        types: [{id: 1, extensions: 'mp4'}],
      },
    ]
    const key = getWatcherFoldersConfigKey(folders)

    expect(foldersConfigUnchanged(key, folders)).toBe(true)
    expect(foldersConfigUnchanged(key, [
      {
        path: '/media/movies',
        types: [{id: 2, extensions: 'mp4'}],
      },
    ])).toBe(false)
    expect(foldersConfigUnchanged('', folders)).toBe(false)
  })
})
