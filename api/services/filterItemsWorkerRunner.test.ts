/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { ParsedItem } from '../../app/types/items'

const { filterItemsMock, workerPathMock } = vi.hoisted(() => ({
  filterItemsMock: vi.fn(
    (_filters: unknown, _type: unknown, items: ParsedItem[]) => items,
  ),
  workerPathMock: vi.fn(),
}))

vi.mock('./filterItems', () => ({
  filterItems: filterItemsMock,
}))

// The compiled worker script (api/workers/filterItemsWorker.js) is a gitignored
// build artifact, so a clean checkout has no .js for Worker to spawn. Mock the
// Worker constructor to exercise the offload branch without a real worker thread.
vi.mock('worker_threads', () => {
  class MockWorker {
    private listeners: Record<string, ((payload: unknown) => void) | undefined> = {}

    constructor(scriptPath: string) {
      workerPathMock(scriptPath)
    }

    on(event: string, cb: (payload: unknown) => void) {
      this.listeners[event] = cb
      return this
    }

    postMessage(request: { items: ParsedItem[] }) {
      const message = this.listeners.message
      queueMicrotask(() => {
        message?.({
          ok: true,
          items: request.items,
          totalFiltered: request.items.length,
          totalFilesize: request.items.reduce(
            (sum, item) => sum + (Number(item.filesize) || 0),
            0,
          ),
        })
      })
    }

    terminate() {
      return Promise.resolve(0)
    }

    removeAllListeners() {}
  }

  return { Worker: MockWorker }
})

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
    expect(workerPathMock).toHaveBeenCalledTimes(1)
  })
})
