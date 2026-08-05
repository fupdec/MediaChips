/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { ParsedItem } from '../../app/types/items'

const { filterItemsMock } = vi.hoisted(() => ({
  filterItemsMock: vi.fn(
    (_filters: unknown, _type: unknown, items: ParsedItem[]) => items,
  ),
}))

vi.mock('./filterItems', () => ({
  filterItems: filterItemsMock,
}))

import { runFilterItemsAsync, terminateFilterItemsWorker } from './filterItemsWorkerRunner'

function makeItems(count: number, filesize = 100): ParsedItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    filesize,
    tags: [],
    values: [],
    key: String(index + 1),
  }))
}

describe('filterItemsWorkerRunner', () => {
  beforeEach(() => {
    filterItemsMock.mockClear()
    delete process.env.MEDIA_CHIPS_FILTER_WORKER
    delete process.env.MEDIA_CHIPS_FILTER_WORKER_THRESHOLD
    terminateFilterItemsWorker()
  })

  afterEach(() => {
    terminateFilterItemsWorker()
  })

  const baseOptions = {
    filters: [{ active: true, param: 'rating', type: 'rating', cond: '>', val: 5 }],
    itemType: 'media',
    sortBy: 'id',
    direction: 'desc',
    find_duplicates: false,
  }

  it('runs synchronously below the worker threshold', async () => {
    const items = makeItems(10)

    const result = await runFilterItemsAsync({
      ...baseOptions,
      items,
    })

    expect(filterItemsMock).toHaveBeenCalledTimes(1)
    expect(result.totalFiltered).toBe(10)
    expect(result.totalFilesize).toBe(1000)
  })

  it('runs synchronously when worker is disabled', async () => {
    process.env.MEDIA_CHIPS_FILTER_WORKER = '0'

    const items = makeItems(1000, 50)

    const result = await runFilterItemsAsync({
      ...baseOptions,
      items,
    })

    expect(filterItemsMock).toHaveBeenCalledTimes(1)
    expect(result.totalFiltered).toBe(1000)
    expect(result.totalFilesize).toBe(50_000)
  })

  it('offloads filtering to a worker thread above the threshold', async () => {
    process.env.MEDIA_CHIPS_FILTER_WORKER_THRESHOLD = '1'

    const items = makeItems(3, 200)

    const result = await runFilterItemsAsync({
      filters: [],
      itemType: 'media',
      items,
      sortBy: 'id',
      direction: 'desc',
      find_duplicates: false,
    })

    expect(result.totalFiltered).toBe(3)
    expect(result.totalFilesize).toBe(600)
    expect(filterItemsMock).not.toHaveBeenCalled()
  })
})
