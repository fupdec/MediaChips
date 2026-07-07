type QueueTask<T> = () => Promise<T>

interface QueueEntry {
  task: QueueTask<unknown>
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

function createConcurrencyQueue(concurrency: number) {
  const limit = Math.max(1, concurrency)
  let active = 0
  const pending: QueueEntry[] = []

  const pump = () => {
    while (active < limit && pending.length > 0) {
      const entry = pending.shift()!
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

  function enqueue<T>(task: QueueTask<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      pending.push({
        task: task as QueueTask<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      })
      pump()
    })
  }

  function enqueueVoid(task: QueueTask<void>): void {
    void enqueue(task).catch(() => {})
  }

  function getStats() {
    return {
      active,
      pending: pending.length,
      limit,
    }
  }

  function reset() {
    pending.length = 0
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
  type QueueTask,
}
