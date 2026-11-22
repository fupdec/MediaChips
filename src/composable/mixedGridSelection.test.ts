import {beforeEach, describe, expect, it, vi} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'
import {useItemsStore} from '@/stores/items'
import {useFsBrowseSelection} from '@/stores/fsBrowseSelection'
import {clearMixedSelectionAnchor, extendMixedGridSelection, selectAllMixedGridEntries, toggleMixedGridSelection} from './mixedGridSelection'
vi.mock('@/stores/app', () => ({useAppStore: () => ({mediaTypes: []})}))

beforeEach(() => {
  setActivePinia(createPinia())
  clearMixedSelectionAnchor()
  useFsBrowseSelection().gridEntries = [
    {kind: 'folder', path: '/folder', name: 'folder'},
    {kind: 'media', id: 3},
    {kind: 'media', id: 1},
    {kind: 'fs-file', path: '/new.mp4', name: 'new.mp4'},
  ]
})

describe('mixed folder and file selection', () => {
  it('selects the full model, including entries outside the DOM viewport', () => {
    selectAllMixedGridEntries()
    selectAllMixedGridEntries()
    expect(useItemsStore().selection).toEqual([3, 1])
    expect(useFsBrowseSelection().selectedEntries.map(entry => entry.path)).toEqual(['/folder', '/new.mp4'])
  })

  it('shares the mouse anchor with keyboard extension and supports shrinking', () => {
    toggleMixedGridSelection({kind: 'folder', path: '/folder'})
    toggleMixedGridSelection({kind: 'pending', path: '/new.mp4'}, {shiftKey: true} as MouseEvent)
    expect(useItemsStore().selection).toEqual([3, 1])
    extendMixedGridSelection({kind: 'pending', path: '/new.mp4'}, {kind: 'media', id: 3})
    expect(useItemsStore().selection).toEqual([3])
    expect(useFsBrowseSelection().selectedEntries.map(entry => entry.path)).toEqual(['/folder'])
  })

  it('retains off-page media and filesystem entries while replacing a range', () => {
    useItemsStore().selection = [99, 1]
    useFsBrowseSelection().setSelectedEntries([{kind: 'fs-file', path: '/other.mp4', name: 'other'}])
    extendMixedGridSelection({kind: 'media', id: 3}, {kind: 'media', id: 1})
    expect(useItemsStore().selection).toEqual([99, 3, 1])
    expect(useFsBrowseSelection().selectedEntries[0].path).toBe('/other.mp4')
  })
})
