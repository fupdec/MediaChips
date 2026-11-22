import {beforeEach, describe, expect, it, vi} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'
import {useItemsStore} from './items'

const mocks = vi.hoisted(() => ({getMediaIds: vi.fn()}))
vi.mock('@/services/typedApi', () => ({typedApi: {getMediaIds: mocks.getMediaIds}}))
vi.mock('@/stores/app', () => ({useAppStore: () => ({mediaTypes: []})}))

beforeEach(() => {setActivePinia(createPinia()); vi.clearAllMocks()})

describe('shared selection actions', () => {
  it('adds a page idempotently and preserves selected files from other pages', () => {
    const store = useItemsStore()
    store.itemsOnPage = [{id: 3}, {id: 1}]
    store.selection = [9, 3]
    store.selectAllOnPage()
    store.selectAllOnPage()
    expect(store.selection).toEqual([9, 3, 1])
    expect(store.isSelect).toBe(true)
  })

  it('uses displayed order for Shift-click, preserves other pages, and shrinks the range', () => {
    const store = useItemsStore()
    store.entities = [{id: 1}, {id: 2}, {id: 3}, {id: 4}, {id: 9}]
    store.itemsOnPage = [{id: 4}, {id: 2}, {id: 3}, {id: 1}]
    store.selection = [9]
    store.toggleSelect(null, {id: 4})
    store.toggleSelect({shiftKey: true} as MouseEvent, {id: 1})
    expect(store.selection).toEqual([9, 4, 2, 3, 1])
    store.selectRange(4, 2)
    expect(store.selection).toEqual([9, 4, 2])
  })

  it('Ctrl+Shift adds a range without replacing independently selected files', () => {
    const store = useItemsStore()
    store.itemsOnPage = [{id: 1}, {id: 2}, {id: 3}, {id: 4}]
    store.selection = [4, 9]
    store.selectionAnchor = 1
    store.toggleSelect({shiftKey: true, ctrlKey: true} as MouseEvent, {id: 2})
    expect(store.selection).toEqual([4, 9, 1, 2])
  })

  it('does not invent a range across unloaded pages when the old anchor is absent', () => {
    const store = useItemsStore()
    store.selection = [1]
    store.itemsOnPage = [{id: 3}, {id: 4}]
    store.selectRange(1, 4)
    expect(store.selection).toEqual([1, 4])
    expect(store.selectionAnchor).toBe(4)
  })

  it('ignores a late select-all response after clearing or editing the selection', async () => {
    const store = useItemsStore()
    store.type = 'media'
    let resolve!: (value: unknown) => void
    mocks.getMediaIds.mockImplementation(() => new Promise(done => {resolve = done}))
    const pending = store.selectAllFiltered()
    store.clearSelection()
    store.toggleSelect(null, {id: 7})
    resolve({data: {ids: [1, 2, 3]}})
    await pending
    expect(store.selection).toEqual([7])
  })

  it('uses filter join mode and limits select-all to an explicit search scope', async () => {
    const store = useItemsStore()
    store.type = 'media'
    store.filtersJoin = 'or'
    store.listScopeIds = [2, 3]
    mocks.getMediaIds.mockResolvedValue({data: {ids: [1, 2, 3, 4]}})
    await store.selectAllFiltered()
    expect(mocks.getMediaIds).toHaveBeenCalledWith(expect.objectContaining({filtersJoin: 'or'}))
    expect(store.selection).toEqual([2, 3])
  })
})
