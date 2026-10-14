import {beforeEach, describe, expect, it, vi} from 'vitest'
import {loadNasBrowserPrefs, persistNasBrowserLocation, restoreNasBrowserFolder} from './nasBrowserPrefs'

describe('remembering NAS browser locations', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('restores the last connection and a separate folder for each connection and library', () => {
    persistNasBrowserLocation('library-a', 'server-one', '/video/Кино')
    persistNasBrowserLocation('library-a', 'server-two', '/archive/2026')
    persistNasBrowserLocation('library-b', 'server-one', '/video/Другое')
    expect(loadNasBrowserPrefs('library-a')).toEqual({
      connectionId: 'server-two', folders: {'server-one': '/video/Кино', 'server-two': '/archive/2026'},
    })
    expect(loadNasBrowserPrefs('library-b')).toEqual({connectionId: 'server-one', folders: {'server-one': '/video/Другое'}})
    expect(loadNasBrowserPrefs('new-library')).toEqual({folders: {}})
  })

  it('uses the root if the saved folder is invalid or the configured root changed', () => {
    expect(restoreNasBrowserFolder('/video/', '/video/Кино')).toBe('/video/Кино')
    expect(restoreNasBrowserFolder('/', '/Кино')).toBe('/Кино')
    for (const path of [undefined, '/old-root/Кино', '/videos/Кино', '/video/../etc', '/video/a\\b', '/video//a']) {
      expect(restoreNasBrowserFolder('/video/', path)).toBe('/video')
    }
  })

  it('handles corrupt or unavailable browser storage without preventing navigation', () => {
    localStorage.setItem('mediachips.nas.browser.library', '{invalid')
    expect(loadNasBrowserPrefs('library')).toEqual({folders: {}})
    localStorage.setItem('mediachips.nas.browser.library', JSON.stringify({connectionId: 3, folders: {good: '/video', bad: 7}}))
    expect(loadNasBrowserPrefs('library')).toEqual({connectionId: undefined, folders: {good: '/video'}})
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable') })
    expect(() => persistNasBrowserLocation('library', 'server', '/video')).not.toThrow()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage unavailable') })
    expect(loadNasBrowserPrefs('library')).toEqual({folders: {}})
  })
})
