import {afterEach, describe, expect, it, vi} from 'vitest'
import {loadFolderFavorites, saveFolderFavorites} from './folderFavorites'
afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })
describe('folder favorites', () => {
  it('retains readable Drive ancestors across sessions and isolates libraries and connections', () => {
    const favorite = {path: '/Google Drive/folder/year', title: 'Google Drive / Movies / 2026',
      pathTitles: {'/Google Drive/folder': 'Movies', '/Google Drive/folder/year': '2026'}}
    saveFolderFavorites('library-a:drive', [favorite])
    expect(loadFolderFavorites('library-a:drive')).toEqual([favorite])
    expect(loadFolderFavorites('library-b:drive')).toEqual([])
    expect(loadFolderFavorites('library-a:nas')).toEqual([])
    saveFolderFavorites('library-a:drive', [])
    expect(loadFolderFavorites('library-a:drive')).toEqual([])
  })
  it('tolerates unavailable storage without breaking browsing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full') })
    expect(loadFolderFavorites('blocked')).toEqual([])
    expect(() => saveFolderFavorites('blocked', [])).not.toThrow()
  })
})
