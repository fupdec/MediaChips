import {describe, expect, it} from 'vitest'
import {
  canGoFolderHistoryBack,
  canGoFolderHistoryForward,
  canGoFolderUp,
  emptyFolderNavHistory,
  recordFolderNavPath,
  seedFolderNavHistory,
  stepFolderNavHistory,
} from './folderNavHistory'

describe('folderNavHistory', () => {
  it('disables back and forward on the first recorded path', () => {
    const history = recordFolderNavPath(emptyFolderNavHistory(), '/Downloads')
    expect(canGoFolderHistoryBack(history)).toBe(false)
    expect(canGoFolderHistoryForward(history)).toBe(false)
  })

  it('does not treat a restored path as a back destination', () => {
    const history = seedFolderNavHistory('/Downloads')
    expect(history.entries).toEqual(['/Downloads'])
    expect(canGoFolderHistoryBack(history)).toBe(false)
    expect(canGoFolderHistoryForward(history)).toBe(false)
  })

  it('enables back after navigating deeper, then forward after going back', () => {
    let history = recordFolderNavPath(emptyFolderNavHistory(), null)
    history = recordFolderNavPath(history, '/Downloads')
    expect(canGoFolderHistoryBack(history)).toBe(true)
    expect(canGoFolderHistoryForward(history)).toBe(false)

    const back = stepFolderNavHistory(history, -1)
    expect(back?.path).toBeNull()
    expect(canGoFolderHistoryBack(back!.history)).toBe(false)
    expect(canGoFolderHistoryForward(back!.history)).toBe(true)

    const forward = stepFolderNavHistory(back!.history, 1)
    expect(forward?.path).toBe('/Downloads')
    expect(canGoFolderHistoryForward(forward!.history)).toBe(false)
  })

  it('drops forward entries after a new navigation from the middle', () => {
    let history = recordFolderNavPath(emptyFolderNavHistory(), null)
    history = recordFolderNavPath(history, '/Downloads')
    history = recordFolderNavPath(history, '/Downloads/Movies')
    history = stepFolderNavHistory(history, -1)!.history
    history = recordFolderNavPath(history, '/Downloads/Music')
    expect(history.entries).toEqual([null, '/Downloads', '/Downloads/Music'])
    expect(canGoFolderHistoryForward(history)).toBe(false)
  })

  it('ignores duplicate records of the current path', () => {
    const first = recordFolderNavPath(emptyFolderNavHistory(), '/Downloads')
    const second = recordFolderNavPath(first, '/Downloads')
    expect(second).toBe(first)
  })
})

describe('canGoFolderUp', () => {
  it('is disabled at the library root and at a folder with no parent', () => {
    expect(canGoFolderUp({parentPath: null, fsParentPath: null})).toBe(false)
    expect(canGoFolderUp({})).toBe(false)
  })

  it('is enabled when a library or filesystem parent exists', () => {
    expect(canGoFolderUp({parentPath: '/Users', fsParentPath: null})).toBe(true)
    expect(canGoFolderUp({parentPath: null, fsParentPath: '/Users'})).toBe(true)
  })

  it('stops at the filesystem browse root even if the library has a parent', () => {
    expect(canGoFolderUp({
      parentPath: '/Users/vit',
      fsParentPath: null,
      hasFsRoot: true,
    })).toBe(false)
    expect(canGoFolderUp({
      parentPath: '/Users/vit',
      fsParentPath: '/Users/vit/Downloads',
      hasFsRoot: true,
    })).toBe(true)
  })
})
