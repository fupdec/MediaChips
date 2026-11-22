import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {effectScope, reactive, shallowRef, type EffectScope} from 'vue'
import {createPinia, setActivePinia} from 'pinia'
import {useItemsStore} from '@/stores/items'
import {useFsBrowseSelection} from '@/stores/fsBrowseSelection'
import {useItemsSelectionScope} from './useItemsSelectionScope'
import type {FilterObject} from '@/types/common'

const mocks = vi.hoisted(() => ({route: {} as any, app: {} as any, clearAnchor: vi.fn()}))
vi.mock('vue-router', () => ({useRouter: () => ({currentRoute: mocks.route})}))
vi.mock('@/stores/app', () => ({useAppStore: () => mocks.app}))
vi.mock('@/composable/useBrowserLayoutHotkeys', () => ({clearMixedGridAnchor: mocks.clearAnchor}))
let scope: EffectScope
const filter = (): FilterObject => ({id: 1, param: 'name', type: 'string', cond: 'includes', val: 'first', active: true, lock: false, note: null})
function start() {
  scope = effectScope()
  scope.run(useItemsSelectionScope)
}
function select() {
  const items = useItemsStore()
  items.toggleSelect(null, {id: 1})
  useFsBrowseSelection().toggleSelected({kind: 'folder', path: '/folder', name: 'folder'})
  return items
}

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.app = reactive({dbPath: '/db/one', mediaTypes: []})
  mocks.route = shallowRef({path: '/media', query: {mediaTypeId: '1'}})
  vi.clearAllMocks()
})
afterEach(() => scope?.stop())

describe('selection lifecycle', () => {
  it('keeps selection across pagination and layout/order changes, but resets the range anchor', () => {
    start()
    const items = select()
    items.page = 2
    items.limit = 50
    items.sortBy = 'createdAt'
    items.sortDir = 'desc'
    items.view = 5
    items.size = 2
    items.itemsOnPage = [{id: 2}]
    expect(items.selection).toEqual([1])
    expect(items.isSelect).toBe(true)
    expect(items.selectionAnchor).toBeNull()
    expect(items.selected_last).toBeNull()
    expect(useFsBrowseSelection().selectedCount).toBe(1)
  })

  it.each(['val', 'active', 'cond'] as const)('clears selection on an in-place filter %s change', field => {
    const items = useItemsStore()
    items.filters = [filter()]
    start()
    select()
    if (field === 'active') items.filters[0].active = false
    else items.filters[0][field] = 'changed'
    expect(items.selection).toEqual([])
    expect(items.isSelect).toBe(false)
    expect(useFsBrowseSelection().selectedCount).toBe(0)
  })

  it('ignores cosmetic filter metadata and changes to disabled rows', () => {
    const items = useItemsStore()
    items.filters = [filter(), {...filter(), active: false}]
    start()
    select()
    items.filters[0].note = 'renamed'
    items.filters[0].id = 22
    items.filters[1].val = 'edited but disabled'
    expect(items.selection).toEqual([1])
  })

  it.each(['filtersJoin', 'namePrefix', 'colorFilter', 'listScopeIds', 'find_duplicates'] as const)('clears selection when %s changes', field => {
    start()
    const items = select()
    if (field === 'filtersJoin') items.filtersJoin = 'or'
    else if (field === 'listScopeIds') items.listScopeIds = [1, 2]
    else if (field === 'find_duplicates') items.find_duplicates = true
    else items[field] = 'new'
    expect(items.selection).toEqual([])
  })

  it('preserves selection for a route page change and clears it for a new section or database', () => {
    start()
    const items = select()
    mocks.route.value = {path: '/media', query: {mediaTypeId: '1', page: '2'}}
    expect(items.selection).toEqual([1])
    mocks.route.value = {path: '/media', query: {mediaTypeId: '2'}}
    expect(items.selection).toEqual([])
    select()
    mocks.route.value = {path: '/settings', query: {}}
    expect(items.selection).toEqual([])
    select()
    mocks.app.dbPath = '/db/two'
    expect(items.selection).toEqual([])
  })
})
