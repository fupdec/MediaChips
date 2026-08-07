import { galleryPerfCounters } from '@/utils/galleryPerfCounters'

type RegenTask = {
  mediaId: number
  run: () => Promise<void>
  resolve: () => void
  reject: (error: unknown) => void
}

const MAX_CONCURRENCY = 3
const inFlight = new Map<number, Promise<void>>()
const queue: RegenTask[] = []
let active = 0

function pump(): void {
  while (active < MAX_CONCURRENCY && queue.length) {
    const task = queue.shift()
    if (!task) return

    if (inFlight.has(task.mediaId)) {
      // Another waiter already covers this id; chain onto it.
      inFlight.get(task.mediaId)!.then(task.resolve, task.reject)
      continue
    }

    active += 1
    galleryPerfCounters.regenInFlight = active
    galleryPerfCounters.regenQueued = queue.length

    const promise = task.run()
      .then(() => {
        task.resolve()
      })
      .catch((error) => {
        task.reject(error)
      })
      .finally(() => {
        inFlight.delete(task.mediaId)
        active = Math.max(0, active - 1)
        galleryPerfCounters.regenInFlight = active
        galleryPerfCounters.regenQueued = queue.length
        galleryPerfCounters.regenCompleted += 1
        pump()
      })

    inFlight.set(task.mediaId, promise)
  }

  galleryPerfCounters.regenQueued = queue.length
}

/**
 * Coalesce per-media thumbnail regeneration so a missing-thumb storm
 * cannot fan out into unbounded updateMediaInfo calls.
 */
export function enqueueImageThumbRegen(
  mediaId: number,
  run: () => Promise<void>,
): Promise<void> {
  const existing = inFlight.get(mediaId)
  if (existing) return existing

  const queued = queue.find((task) => task.mediaId === mediaId)
  if (queued) {
    return new Promise<void>((resolve, reject) => {
      const prevResolve = queued.resolve
      const prevReject = queued.reject
      queued.resolve = () => {
        prevResolve()
        resolve()
      }
      queued.reject = (error) => {
        prevReject(error)
        reject(error)
      }
    })
  }

  return new Promise<void>((resolve, reject) => {
    queue.push({mediaId, run, resolve, reject})
    galleryPerfCounters.regenQueued = queue.length
    pump()
  })
}

export function resetImageThumbRegenQueueForTests(): void {
  queue.length = 0
  inFlight.clear()
  active = 0
  galleryPerfCounters.regenInFlight = 0
  galleryPerfCounters.regenQueued = 0
}
