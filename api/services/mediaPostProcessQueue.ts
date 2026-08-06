import { AsyncLocalStorage } from 'node:async_hooks'
import { createConcurrencyQueue } from './concurrencyQueue'

const ffmpegQueue = createConcurrencyQueue(1)
const ffprobeQueue = createConcurrencyQueue(2)

/** Prevents deadlock when callers wrap work that itself calls runWith*Limit. */
const ffmpegHeld = new AsyncLocalStorage<true>()
const ffprobeHeld = new AsyncLocalStorage<true>()

function runWithFfmpegLimit<T>(task: () => Promise<T>): Promise<T> {
  if (ffmpegHeld.getStore()) return task()
  return ffmpegQueue.enqueue(() => ffmpegHeld.run(true, task))
}

function runWithFfprobeLimit<T>(task: () => Promise<T>): Promise<T> {
  if (ffprobeHeld.getStore()) return task()
  return ffprobeQueue.enqueue(() => ffprobeHeld.run(true, task))
}

function getMediaPostProcessQueueStats() {
  return {
    ffmpeg: ffmpegQueue.getStats(),
    ffprobe: ffprobeQueue.getStats(),
  }
}

function resetMediaPostProcessQueues(): void {
  ffmpegQueue.reset()
  ffprobeQueue.reset()
}

export {
  runWithFfmpegLimit,
  runWithFfprobeLimit,
  getMediaPostProcessQueueStats,
  resetMediaPostProcessQueues,
}
