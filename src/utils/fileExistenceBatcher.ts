type PendingEntry = {
  resolve: (exists: boolean) => void
  reject: (error: unknown) => void
}

const FLUSH_DELAY_MS = 32
const MAX_BATCH_SIZE = 100

let pendingPaths = new Map<string, PendingEntry[]>()
let flushTimer: ReturnType<typeof setTimeout> | null = null
let flushPromise: Promise<void> | null = null

async function defaultBatchChecker(paths: string[]): Promise<Record<string, boolean>> {
  const { typedApi } = await import('@/services/typedApi')
  const response = await typedApi.checkFilesExist(paths)
  return response.data.results
}

let batchChecker = defaultBatchChecker

export function setFileExistenceBatchChecker(
  checker: (paths: string[]) => Promise<Record<string, boolean>>,
): void {
  batchChecker = checker
}

export function resetFileExistenceBatchChecker(): void {
  batchChecker = defaultBatchChecker
}

function scheduleFlush(): void {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flushQueue()
  }, FLUSH_DELAY_MS)
}

function requeueBatchEntries(batch: Map<string, PendingEntry[]>, paths: string[]): void {
  for (const path of paths) {
    const entries = batch.get(path)
    if (!entries?.length) continue

    const existing = pendingPaths.get(path) || []
    pendingPaths.set(path, [...entries, ...existing])
  }
}

function settleBatchPaths(
  batch: Map<string, PendingEntry[]>,
  paths: string[],
  settle: (entry: PendingEntry) => void,
): void {
  for (const path of paths) {
    for (const entry of batch.get(path) || []) {
      settle(entry)
    }
  }
}

async function flushQueue(): Promise<void> {
  while (flushPromise) {
    await flushPromise
  }

  if (!pendingPaths.size) return

  const batch = pendingPaths
  pendingPaths = new Map()

  const allPaths = [...batch.keys()]
  const paths = allPaths.slice(0, MAX_BATCH_SIZE)
  const overflowPaths = allPaths.slice(MAX_BATCH_SIZE)

  requeueBatchEntries(batch, overflowPaths)

  flushPromise = (async () => {
    try {
      const results = await batchChecker(paths)
      for (const path of paths) {
        const exists = results[path] === true
        for (const entry of batch.get(path) || []) {
          entry.resolve(exists)
        }
      }
    } catch (error) {
      settleBatchPaths(batch, paths, (entry) => entry.reject(error))
    } finally {
      flushPromise = null
    }
  })()

  await flushPromise

  if (pendingPaths.size) {
    return flushQueue()
  }
}

export function queueFileExistenceCheck(filePath: string): Promise<boolean> {
  const entries = pendingPaths.get(filePath) || []
  const promise = new Promise<boolean>((resolve, reject) => {
    entries.push({ resolve, reject })
  })
  pendingPaths.set(filePath, entries)
  scheduleFlush()
  return promise
}

export function clearFileExistenceBatchQueue(): void {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  pendingPaths.clear()
}
