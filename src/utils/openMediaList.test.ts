/**
 * @vitest-environment node
 */
import {beforeEach, describe, expect, it, vi} from 'vitest'

const push = vi.fn(async () => undefined)
const currentRoute = {value: {path: '/home', query: {}}}

vi.mock('@/router', () => ({
  default: {
    push,
    currentRoute,
  },
}))

const itemsStore = {
  filters: [] as unknown[],
  find_duplicates: false,
  duplicates_by: null as string | null,
  listScopeIds: null as number[] | null,
  listScope: null as unknown,
  updateState: vi.fn(),
}

vi.mock('@/stores/items', () => ({
  useItemsStore: () => itemsStore,
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => ({
    mediaTypes: [{id: 1, hidden: false}],
  }),
}))

vi.mock('@/utils/mediaType', () => ({
  getDefaultMediaTypeId: () => 1,
}))

const pageCommands = {
  setSortBy: vi.fn(),
  setSortDir: vi.fn(),
  setGroupBy: vi.fn(),
  reloadItems: vi.fn(async () => undefined),
  setFilters: vi.fn(),
}

let filtersRegistered = false
const filtersController = {
  applySaved: vi.fn(async () => undefined),
  deactivateAll: vi.fn(),
  apply: vi.fn(),
  deactivate: vi.fn(),
}

vi.mock('@/composable/itemsPageCommands', () => ({
  isItemsPageCommandsRegistered: () => true,
  useItemsPageCommands: () => pageCommands,
}))

vi.mock('@/composable/itemsFiltersController', () => ({
  isItemsFiltersControllerRegistered: () => filtersRegistered,
  useItemsFiltersController: () => filtersController,
}))

describe('openMediaList', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    filtersRegistered = false
    currentRoute.value = {path: '/home', query: {}}
    itemsStore.filters = []
    itemsStore.listScopeIds = null
    itemsStore.listScope = null
  })

  it('waits for filters controller before applySaved from home', async () => {
    const {useOpenMediaList} = await import('./openMediaList')
    const {openMediaList} = useOpenMediaList()

    const filter = {
      id: null,
      param: 'mediaCreatedAt',
      type: 'date',
      cond: '>=',
      val: '2026-08-12',
      note: 'home-created-day',
      active: true,
      lock: false,
      order: 0,
      clientKey: 'x',
    }

    const openPromise = openMediaList({
      sortBy: 'mediaCreatedAt',
      sortDir: 'desc',
      groupBy: 'dateDay',
      filters: [filter as never],
    })

    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(filtersController.applySaved).not.toHaveBeenCalled()

    filtersRegistered = true
    await openPromise

    expect(push).toHaveBeenCalledWith('/media?mediaTypeId=1')
    expect(filtersController.applySaved).toHaveBeenCalledWith([filter])
    expect(pageCommands.setSortBy).toHaveBeenCalledWith('mediaCreatedAt')
    expect(pageCommands.setGroupBy).toHaveBeenCalledWith('dateDay')
  })
})
