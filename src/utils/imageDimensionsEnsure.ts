import { typedApi } from '@/services/typedApi'
import { syncMediaFileInfo } from '@/services/mediaFileInfoService'

type EnsureTask = {
  mediaId: number
  resolve: (value: {width: number; height: number} | null) => void
  reject: (error: unknown) => void
}

const MAX_CONCURRENCY = 2
const inFlight = new Map<number, Promise<{width: number; height: number} | null>>()
const queue: EnsureTask[] = []
/** Ids already finished (success or miss) — avoid re-probing every scroll. */
const settled = new Set<number>()
let active = 0

function pump(): void {
  while (active < MAX_CONCURRENCY && queue.length) {
    const task = queue.shift()
    if (!task) return

    if (inFlight.has(task.mediaId)) {
      inFlight.get(task.mediaId)!.then(task.resolve, task.reject)
      continue
    }

    active += 1
    const promise = runEnsure(task.mediaId)
      .then((dims) => {
        task.resolve(dims)
        return dims
      })
      .catch((error) => {
        task.reject(error)
        throw error
      })
      .finally(() => {
        settled.add(task.mediaId)
        inFlight.delete(task.mediaId)
        active = Math.max(0, active - 1)
        pump()
      })

    inFlight.set(task.mediaId, promise)
  }
}

async function runEnsure(
  mediaId: number,
): Promise<{width: number; height: number} | null> {
  const res = await typedApi.ensureImageDimensions(mediaId)
  const width = Number(res.data?.width) || 0
  const height = Number(res.data?.height) || 0
  if (width <= 0 || height <= 0) return null

  const orientation = Number(res.data?.orientation) || undefined
  syncMediaFileInfo(mediaId, {
    width,
    height,
    ...(orientation ? {orientation} : {}),
  })
  return {width, height}
}

/**
 * Coalesce metadata-only dimension backfills (no thumb regen).
 */
export function enqueueEnsureImageDimensions(
  mediaId: number,
): Promise<{width: number; height: number} | null> {
  const id = Number(mediaId)
  if (!id) return Promise.resolve(null)

  const existing = inFlight.get(id)
  if (existing) return existing

  const queued = queue.find((task) => task.mediaId === id)
  if (queued) {
    return new Promise((resolve, reject) => {
      const prevResolve = queued.resolve
      const prevReject = queued.reject
      queued.resolve = (value) => {
        prevResolve(value)
        resolve(value)
      }
      queued.reject = (error) => {
        prevReject(error)
        reject(error)
      }
    })
  }

  if (settled.has(id)) return Promise.resolve(null)

  return new Promise((resolve, reject) => {
    queue.push({mediaId: id, resolve, reject})
    pump()
  })
}

export function resetImageDimensionsEnsureForTests(): void {
  queue.length = 0
  inFlight.clear()
  settled.clear()
  active = 0
}
