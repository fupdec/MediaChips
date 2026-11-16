import {beforeEach, describe, expect, it, vi} from 'vitest'
import {driveBrowserRoot} from './driveBrowse'
import {loadDriveBrowserLocation, persistDriveBrowserLocation} from './driveBrowserPrefs'

describe('remembering Google Drive browser locations', () => {
  beforeEach(() => { vi.restoreAllMocks(); localStorage.clear() })
  it('keeps the last folder and readable ancestor names separately for each library/server', () => {
    const path = `${driveBrowserRoot}/movies/2026`
    persistDriveBrowserLocation('library-a/server-a', path, {
      [`${driveBrowserRoot}/movies`]: 'Кино', [path]: '2026', [`${driveBrowserRoot}/other`]: 'Unrelated',
    })
    persistDriveBrowserLocation('library-b/server-a', `${driveBrowserRoot}/photos`, {})
    expect(loadDriveBrowserLocation('library-a/server-a')).toEqual({path, pathTitles: {
      [driveBrowserRoot]: 'Google Drive', [`${driveBrowserRoot}/movies`]: 'Кино', [path]: '2026',
    }})
    expect(loadDriveBrowserLocation('library-b/server-a').path).toBe(`${driveBrowserRoot}/photos`)
    expect(loadDriveBrowserLocation('library-a/server-b').path).toBe(driveBrowserRoot)
    persistDriveBrowserLocation('library-a/server-a', driveBrowserRoot, {})
    expect(loadDriveBrowserLocation('library-a/server-a').path).toBe(driveBrowserRoot)
  })
  it.each(['/other/folder', `${driveBrowserRoot}/../etc`, `${driveBrowserRoot}//folder`, `${driveBrowserRoot}/bad?path`, `${driveBrowserRoot}/bad\\path`])('falls back to the root for invalid stored path %s', path => {
    localStorage.setItem('mediachips.drive.browser.test', JSON.stringify({path}))
    expect(loadDriveBrowserLocation('test').path).toBe(driveBrowserRoot)
  })
  it('ignores corrupt storage and invalid folder labels', () => {
    localStorage.setItem('mediachips.drive.browser.test', '{bad json')
    expect(loadDriveBrowserLocation('test').path).toBe(driveBrowserRoot)
    localStorage.setItem('mediachips.drive.browser.test', JSON.stringify({path: `${driveBrowserRoot}/folder`, pathTitles: {[`${driveBrowserRoot}/folder`]: 42}}))
    expect(loadDriveBrowserLocation('test').pathTitles).toEqual({[driveBrowserRoot]: 'Google Drive'})
  })
  it('keeps browsing available when browser storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked') })
    expect(() => persistDriveBrowserLocation('test', driveBrowserRoot, {})).not.toThrow()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked') })
    expect(loadDriveBrowserLocation('test').path).toBe(driveBrowserRoot)
  })
})
