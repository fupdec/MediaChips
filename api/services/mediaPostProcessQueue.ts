import { AsyncLocalStorage } from 'node:async_hooks'
import { createConcurrencyQueue } from './concurrencyQueue'

/** Live playback / thumbs / grids — keep responsive; remux must not share this. */
const ffmpegQueue = createConcurrencyQueue(1)
const ffprobeQueue = createConcurrencyQueue(2)
/** Progressive layout remux — separate so copy-remux cannot block live streams. */
const remuxQueue = createConcurrencyQueue(1)

/** Prevents deadlock when callers wrap work that itself calls runWith*Limit. */
const ffmpegHeld = new AsyncLocalStorage<true>()
const ffprobeHeld = new AsyncLocalStorage<true>()
const remuxHeld = new AsyncLocalStorage<true>()

function runWithFfmpegLimit<T>(task: () => Promise<T>): Promise<T> {
  if (ffmpegHeld.getStore()) return task()
  return ffmpegQueue.enqueue(() => ffmpegHeld.run(true, task))
}

function runWithFfprobeLimit<T>(task: () => Promise<T>): Promise<T> {
  if (ffprobeHeld.getStore()) return task()
  return ffprobeQueue.enqueue(() => ffprobeHeld.run(true, task))
}

function runWithRemuxLimit<T>(task: () => Promise<T>): Promise<T> {
  if (remuxHeld.getStore()) return task()
  return remuxQueue.enqueue(() => remuxHeld.run(true, task))
}

function getMediaPostProcessQueueStats() {
  return {
    ffmpeg: ffmpegQueue.getStats(),
    ffprobe: ffprobeQueue.getStats(),
    remux: remuxQueue.getStats(),
  }
}

function resetMediaPostProcessQueues(): void {
  ffmpegQueue.reset()
  ffprobeQueue.reset()
  remuxQueue.reset()
}

export {
  runWithFfmpegLimit,
  runWithFfprobeLimit,
  runWithRemuxLimit,
  getMediaPostProcessQueueStats,
  resetMediaPostProcessQueues,
}
