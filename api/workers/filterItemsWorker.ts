import { parentPort } from 'worker_threads'
import { filterItems } from '../../app/tasks/items'
import type {
  FilterItemsWorkerRequest,
  FilterItemsWorkerResponse,
} from '../types/filterItemsWorker'

if (!parentPort) {
  throw new Error('filterItemsWorker must be started as a worker thread')
}

parentPort.on('message', (request: FilterItemsWorkerRequest) => {
  try {
    const filtered = filterItems(
      request.filters,
      request.itemType,
      request.items,
      request.sortBy,
      request.direction,
      request.find_duplicates,
      request.duplicates_by ?? 'filesize',
      request.sortMetaType ?? null,
    )

    const response: FilterItemsWorkerResponse = {
      ok: true,
      items: filtered,
      totalFiltered: filtered.length,
      totalFilesize: filtered.reduce(
        (sum, item) => sum + (Number(item.filesize) || 0),
        0,
      ),
    }

    parentPort!.postMessage(response)
  } catch (error: unknown) {
    const response: FilterItemsWorkerResponse = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
    parentPort!.postMessage(response)
  }
})
