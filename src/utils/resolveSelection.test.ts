import {beforeEach, describe, expect, it, vi} from 'vitest'
import {resolveSelectedMediaItems, shouldReloadListAfterBulkAction} from './resolveSelection'

const mocks = vi.hoisted(() => ({
  store: {entities: [{id: 1, name: 'loaded'}], itemsOnPage: [{id: 1}]},
  basics: vi.fn(),
}))
vi.mock('@/stores/items', () => ({useItemsStore: () => mocks.store}))
vi.mock('@/services/typedApi', () => ({typedApi: {getMediaBasics: mocks.basics}}))

describe('resolving a selection across pages', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads missing items in bounded requests and preserves selection order without duplicates', async () => {
    mocks.basics.mockImplementation(async ({ids}: {ids: number[]}) => ({
      data: {items: [...ids].reverse().map(id => ({id, name: `media ${id}`}))},
    }))
    const ids = [1, ...Array.from({length: 1001}, (_, i) => i + 2), 1]
    const result = await resolveSelectedMediaItems(ids)
    expect(result.map(item => item.id)).toEqual(ids.slice(0, -1))
    expect(result[0]).toBe(mocks.store.entities[0])
    expect(mocks.basics.mock.calls.map(([body]) => body.ids.length)).toEqual([500, 500, 1])
  })

  it('does not present a failed load as a partial successful selection', async () => {
    mocks.basics.mockRejectedValue(new Error('offline'))
    await expect(resolveSelectedMediaItems([1, 2])).rejects.toThrow('offline')
  })

  it('reloads after actions covering unloaded IDs, even when the selection count equals the page size', () => {
    expect(shouldReloadListAfterBulkAction([2])).toBe(true)
    expect(shouldReloadListAfterBulkAction([1])).toBe(false)
  })
})
