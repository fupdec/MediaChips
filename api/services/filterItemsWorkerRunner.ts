import { Worker } from 'worker_threads'
import path from 'path'
import { filterItems } from '../../app/tasks/items'
import type { FilterLike } from '../types/db'
import type { ParsedItem } from '../../app/types/items'
import type {
  FilterItemsWorkerRequest,
  FilterItemsWorkerResponse,
} from '../types/filterItemsWorker'

export interface RunFilterItemsOptions {
  filters: FilterLike[]
  itemType: string
  items: ParsedItem[]
  sortBy: string
  direction: string
  find_duplicates: boolean
  duplicates_by?: string
  sortMetaType?: string | null
}

export interface RunFilterItemsResult {
  items: ParsedItem[]
  totalFiltered: number
  totalFilesize: number
}

const DEFAULT_WORKER_THRESHOLD = 500
const WORKER_TIMEOUT_MS = 5 * 60_000

function getWorkerThreshold(): number {
  const raw = process.env.MEDIA_CHIPS_FILTER_WORKER_THRESHOLD
  if (raw == null || raw === '') return DEFAULT_WORKER_THRESHOLD
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_WORKER_THRESHOLD
}

function isWorkerEnabled(): boolean {
  return process.env.MEDIA_CHIPS_FILTER_WORKER !== '0'
}

function getWorkerScriptPath(): string {
  return path.join(__dirname, '../workers/filterItemsWorker.js')
}

function runFilterItemsSync(options: RunFilterItemsOptions): RunFilterItemsResult {
  const filtered = filterItems(
    options.filters,
    options.itemType,
    options.items,
    options.sortBy,
    options.direction,
    options.find_duplicates,
    options.duplicates_by ?? 'filesize',
    options.sortMetaType ?? null,
  )

  return {
    items: filtered,
    totalFiltered: filtered.length,
    totalFilesize: filtered.reduce(
      (sum, item) => sum + (Number(item.filesize) || 0),
      0,
    ),
  }
}

let worker: Worker | null = null
let workerBusy = false

type PendingJob = {
  request: FilterItemsWorkerRequest
  resolve: (value: RunFilterItemsResult) => void
  reject: (error: Error) => void
}

const jobQueue: PendingJob[] = []

function terminateWorker(): void {
  if (!worker) return
  worker.removeAllListeners()
  worker.terminate().catch(() => {})
  worker = null
  workerBusy = false
}

function rejectQueuedJobs(error: Error): void {
  while (jobQueue.length) {
    jobQueue.shift()?.reject(error)
  }
}

function ensureWorker(): Worker {
  if (worker) return worker

  worker = new Worker(getWorkerScriptPath())

  worker.on('message', (response: FilterItemsWorkerResponse) => {
    const job = jobQueue.shift()
    workerBusy = false

    if (!job) return

    if (!response.ok) {
      job.reject(new Error(response.error || 'Filter worker failed'))
      pumpWorkerQueue()
      return
    }

    job.resolve({
      items: response.items,
      totalFiltered: response.totalFiltered,
      totalFilesize: response.totalFilesize,
    })
    pumpWorkerQueue()
  })

  worker.on('error', (error) => {
    const job = jobQueue.shift()
    workerBusy = false
    terminateWorker()
    if (job) {
      job.reject(error instanceof Error ? error : new Error(String(error)))
    }
    rejectQueuedJobs(error instanceof Error ? error : new Error(String(error)))
  })

  worker.on('exit', (code) => {
    if (code === 0) return
    const error = new Error(`Filter worker exited with code ${code}`)
    terminateWorker()
    rejectQueuedJobs(error)
  })

  return worker
}

function pumpWorkerQueue(): void {
  if (workerBusy || !jobQueue.length) return

  const job = jobQueue[0]
  workerBusy = true

  const activeWorker = ensureWorker()
  activeWorker.postMessage(job.request)
}

function runFilterItemsInWorker(options: RunFilterItemsOptions): Promise<RunFilterItemsResult> {
  const request: FilterItemsWorkerRequest = {
    filters: options.filters,
    itemType: options.itemType,
    items: options.items,
    sortBy: options.sortBy,
    direction: options.direction,
    find_duplicates: options.find_duplicates,
    duplicates_by: options.duplicates_by,
    sortMetaType: options.sortMetaType ?? null,
  }

  return new Promise((resolve, reject) => {
    let settled = false

    const job: PendingJob = {
      request,
      resolve: (value) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        resolve(value)
      },
      reject: (error) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        reject(error)
      },
    }

    const timeout = setTimeout(() => {
      const index = jobQueue.indexOf(job)
      if (index >= 0) jobQueue.splice(index, 1)
      workerBusy = false
      terminateWorker()
      job.reject(new Error('Filter worker timed out'))
    }, WORKER_TIMEOUT_MS)

    jobQueue.push(job)
    pumpWorkerQueue()
  })
}

export async function runFilterItemsAsync(
  options: RunFilterItemsOptions,
): Promise<RunFilterItemsResult> {
  const threshold = getWorkerThreshold()
  if (!isWorkerEnabled() || options.items.length < threshold) {
    return runFilterItemsSync(options)
  }

  try {
    return await runFilterItemsInWorker(options)
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[filterItemsWorker] Falling back to main-thread filter:',
        error instanceof Error ? error.message : String(error),
      )
    }
    return runFilterItemsSync(options)
  }
}

export function terminateFilterItemsWorker(): void {
  rejectQueuedJobs(new Error('Filter worker terminated'))
  terminateWorker()
}
