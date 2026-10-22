import {runLibraryOperation, bindLibraryOperation} from './libraryMaintenance'
type QueueTask<T> = () => Promise<T>

export type ConcurrencyEnqueueOptions = {
  /**
   * Higher runs sooner. Default is a rising sequence so newer scroll/HTTP
   * work jumps ahead of stale backlog (LIFO among default enqueues).
   */
  priority?: number
  /** If aborted while pending, the task is dropped and never started. */
  signal?: AbortSignal
}

export type ConcurrencyQueueOptions = {
  /**
   * Soft cap on waiting tasks. When exceeded, the lowest-priority (oldest
   * default) pending entry is rejected so scroll storms cannot grow without bound.
   */
  maxPending?: number
}

interface QueueEntry {
  task: QueueTask<unknown>
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
  priority: number
  seq: number
  signal?: AbortSignal
  abortHandler?: () => void
}

function isAbortError(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'name' in error
    && (error as {name?: string}).name === 'AbortError',
  )
}

function createAbortError(message = 'Queue task aborted'): Error {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

function createConcurrencyQueue(
  concurrency: number,
  queueOptions: ConcurrencyQueueOptions = {},
) {
  const limit = Math.max(1, concurrency)
  const maxPending = queueOptions.maxPending != null
    ? Math.max(0, queueOptions.maxPending)
    : null
  let active = 0
  let seqCounter = 0
  let defaultPriorityCounter = 0
  const pending: QueueEntry[] = []

  const detachAbort = (entry: QueueEntry) => {
    if (entry.signal && entry.abortHandler) {
      entry.signal.removeEventListener('abort', entry.abortHandler)
    }
    entry.abortHandler = undefined
  }

  const rejectEntry = (entry: QueueEntry, reason: Error) => {
    detachAbort(entry)
    entry.reject(reason)
  }

  const insertPending = (entry: QueueEntry) => {
    // Higher priority first; among equals, higher seq (newer) first.
    let index = pending.findIndex(
      (other) =>
        entry.priority > other.priority
        || (entry.priority === other.priority && entry.seq > other.seq),
    )
    if (index < 0) index = pending.length
    pending.splice(index, 0, entry)

    if (maxPending == null) return
    while (pending.length > maxPending) {
      const dropped = pending.pop()
      if (!dropped) break
      rejectEntry(dropped, createAbortError('Queue overflow'))
    }
  }

  const pump = () => {
    while (active < limit && pending.length > 0) {
      const entry = pending.shift()!
      detachAbort(entry)

      if (entry.signal?.aborted) {
        entry.reject(createAbortError())
        continue
      }

      active += 1

      void entry.task()
        .then((result) => {
          active -= 1
          pump()
          entry.resolve(result)
        })
        .catch((error) => {
          active -= 1
          pump()
          entry.reject(error)
        })
    }
  }

  function enqueue<T>(
    task: QueueTask<T>,
    options: ConcurrencyEnqueueOptions = {},
  ): Promise<T> {
    const priority = options.priority ?? (++defaultPriorityCounter)
    const seq = ++seqCounter

    return runLibraryOperation(() => new Promise<T>((resolve, reject) => {
      if (options.signal?.aborted) {
        reject(createAbortError())
        return
      }

      const entry: QueueEntry = {
        task: bindLibraryOperation(task) as QueueTask<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
        priority,
        seq,
        signal: options.signal,
      }

      if (options.signal) {
        entry.abortHandler = () => {
          const index = pending.indexOf(entry)
          if (index < 0) return
          pending.splice(index, 1)
          rejectEntry(entry, createAbortError())
        }
        options.signal.addEventListener('abort', entry.abortHandler, {once: true})
      }

      insertPending(entry)
      pump()
    }))
  }

  function enqueueVoid(
    task: QueueTask<void>,
    options: ConcurrencyEnqueueOptions = {},
  ): void {
    void enqueue(task, options).catch(() => {})
  }

  function getStats() {
    return {
      active,
      pending: pending.length,
      limit,
      maxPending,
    }
  }

  function reset() {
    for (const entry of pending.splice(0)) {
      rejectEntry(entry, createAbortError('Queue reset'))
    }
    active = 0
  }

  return {
    enqueue,
    enqueueVoid,
    getStats,
    reset,
  }
}

export {
  createConcurrencyQueue,
  createAbortError,
  isAbortError,
  type QueueTask,
}
