import {effectScope, type EffectScope} from 'vue'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {useRememberedTab} from './useRememberedTab'
const scopes: EffectScope[] = []
function open(key = 'tabs', choices: readonly string[] = ['local', 'sources', 'links']) {
  const scope = effectScope()
  scopes.push(scope)
  return scope.run(() => useRememberedTab(key, choices, 'local'))!
}
afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); vi.restoreAllMocks(); localStorage.clear() })
describe('remembered tabs', () => {
  it('restores choices after the previous component has closed', () => {
    const first = open()
    first.tab.value = 'sources'
    scopes[0].stop()
    expect(open().tab.value).toBe('sources')
  })
  it('restores a choice changed by another mounted instance and keeps separate tab groups independent', () => {
    const dialog = open()
    const other = open()
    other.tab.value = 'links'
    dialog.restore()
    expect(dialog.tab.value).toBe('links')
    expect(open('providers').tab.value).toBe('local')
  })
  it('falls back for invalid or unavailable tabs, including Links in the SFW build', () => {
    localStorage.setItem('tabs', 'links')
    expect(open('tabs', ['local', 'sources']).tab.value).toBe('local')
    localStorage.setItem('tabs', 'removed-tab')
    expect(open().tab.value).toBe('local')
  })
  it('keeps tabs usable when browser storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full') })
    const {tab} = open()
    expect(tab.value).toBe('local')
    expect(() => { tab.value = 'sources' }).not.toThrow()
    expect(tab.value).toBe('sources')
  })
})
