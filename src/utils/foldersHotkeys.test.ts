import {describe, expect, it} from 'vitest'
import {resolveFoldersHotkey} from './foldersHotkeys'

describe('resolveFoldersHotkey', () => {
  it('uses Backspace to go up, not delete', () => {
    expect(resolveFoldersHotkey({code: 'Backspace', focusedKind: 'media'})).toBe('go-up')
    expect(resolveFoldersHotkey({code: 'Backspace', focusedKind: 'folder'})).toBe('go-up')
    expect(resolveFoldersHotkey({
      code: 'Backspace',
      metaKey: true,
      focusedKind: 'media',
    })).toBe('delete-media')
  })

  it('deletes media with Delete', () => {
    expect(resolveFoldersHotkey({code: 'Delete', focusedKind: 'media'})).toBe('delete-media')
    expect(resolveFoldersHotkey({code: 'Delete', focusedKind: 'folder'})).toBe(null)
  })

  it('opens folder on Enter and tags on T', () => {
    expect(resolveFoldersHotkey({code: 'Enter', focusedKind: 'folder'})).toBe('open-folder')
    expect(resolveFoldersHotkey({code: 'Enter', focusedKind: 'media'})).toBe('edit-media')
    expect(resolveFoldersHotkey({code: 'KeyT', focusedKind: 'folder'})).toBe('open-tags')
  })

  it('maps history and alt-up', () => {
    expect(resolveFoldersHotkey({
      code: 'BracketLeft',
      metaKey: true,
      focusedKind: null,
    })).toBe('history-back')
    expect(resolveFoldersHotkey({
      code: 'ArrowUp',
      altKey: true,
      focusedKind: null,
    })).toBe('go-up')
  })
})
