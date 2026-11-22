import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {createApp, h, shallowRef, type App} from 'vue'
import {createPinia, setActivePinia} from 'pinia'
import {useItemsStore} from '@/stores/items'
import {useFsBrowseSelection} from '@/stores/fsBrowseSelection'
import {useItemsSelectionHotkeys} from './useItemsSelectionHotkeys'
import {useFoldersBrowserFocus} from './useFoldersBrowserFocus'

const mocks = vi.hoisted(() => ({route: {} as any}))
vi.mock('vue-router', async importOriginal => ({...await importOriginal<typeof import('vue-router')>(), useRouter: () => ({currentRoute: mocks.route})}))
vi.mock('@/stores/app', () => ({useAppStore: () => ({mediaTypes: []})}))
vi.mock('@/stores/player', () => ({usePlayerStore: () => ({active: false})}))
vi.mock('@/stores/contextMenu', () => ({useContextMenu: () => ({show: false})}))
vi.mock('@/utils/keyboardTarget', () => ({isBlockingOverlayOpen: () => false, isTypingTarget: () => false}))
let app: App
function mount() {
  app = createApp({setup() {
    useItemsSelectionHotkeys({onExitSelect: () => useItemsStore().clearSelection()})
    return () => h('div')
  }})
  app.mount(document.createElement('div'))
}
function key(code: string, modifiers: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', {code, cancelable: true, ...modifiers})
  window.dispatchEvent(event)
  return event
}

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.route = shallowRef({path: '/media'})
  useFoldersBrowserFocus().clearFocus()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {callback(0); return 1})
})
afterEach(() => {app?.unmount(); vi.unstubAllGlobals()})

describe('selection keyboard parity', () => {
  it('uses the mouse range action for Shift+arrows and retains other pages', () => {
    const store = useItemsStore()
    store.itemsOnPage = [{id: 4}, {id: 2}, {id: 3}]
    store.selection = [99]
    store.toggleSelect(null, {id: 4})
    mount()
    key('ArrowRight', {shiftKey: true})
    expect(store.selection).toEqual([99, 4, 2])
    key('ArrowRight', {shiftKey: true})
    expect(store.selection).toEqual([99, 4, 2, 3])
    key('ArrowLeft', {shiftKey: true})
    expect(store.selection).toEqual([99, 4, 2])
    key('Space')
    expect(store.selection).toEqual([99, 4])
  })

  it.each([{ctrlKey: true}, {metaKey: true}])('adds the page on Ctrl/Cmd+A, matching the toolbar action', modifiers => {
    const store = useItemsStore()
    store.itemsOnPage = [{id: 2}, {id: 3}]
    store.selection = [99, 2]
    store.isSelect = true
    mount()
    expect(key('KeyA', modifiers).defaultPrevented).toBe(true)
    expect(store.selection).toEqual([99, 2, 3])
    key('Escape')
    expect(store.selection).toEqual([])
    expect(store.isSelect).toBe(false)
  })

  it('selects the full mixed folder list on Ctrl+A without requiring rendered DOM nodes', () => {
    mocks.route.value = {path: '/folders'}
    const store = useItemsStore()
    store.isSelect = true
    useFsBrowseSelection().gridEntries = [
      {kind: 'folder', path: '/folder', name: 'folder'},
      {kind: 'media', id: 5},
      {kind: 'fs-file', path: '/new.mp4', name: 'new'},
    ]
    mount()
    key('KeyA', {ctrlKey: true})
    expect(store.selection).toEqual([5])
    expect(useFsBrowseSelection().selectedCount).toBe(2)
  })
})
