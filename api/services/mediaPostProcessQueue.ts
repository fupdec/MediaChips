import { AsyncLocalStorage } from 'node:async_hooks'
import {
  createConcurrencyQueue,
  type ConcurrencyEnqueueOptions,
} from './concurrencyQueue'

/**
 * Live playback / thumbs / grids — keep responsive; remux must not share this.
 * Concurrency 2 lets infinite-scroll thumb storms overlap without saturating Linux CPUs.
 */
export const FFMPEG_QUEUE_CONCURRENCY = 2
/** Cap scroll/HTTP thumb storms so stale pending work cannot grow without bound. */
export const FFMPEG_QUEUE_MAX_PENDING = 48
const ffmpegQueue = createConcurrencyQueue(FFMPEG_QUEUE_CONCURRENCY, {
  maxPending: FFMPEG_QUEUE_MAX_PENDING,
})
const ffprobeQueue = createConcurrencyQueue(2, {maxPending: 64})
/** Progressive layout remux — separate so copy-remux cannot block live streams. */
const remuxQueue = createConcurrencyQueue(1)
/** User-requested conversions are isolated from playback and remux work. */
const conversionQueue = createConcurrencyQueue(1)
const conversionHeld = new AsyncLocalStorage<true>()

/** Prevents deadlock when callers wrap work that itself calls runWith*Limit. */
const ffmpegHeld = new AsyncLocalStorage<true>()
const ffprobeHeld = new AsyncLocalStorage<true>()
const remuxHeld = new AsyncLocalStorage<true>()

export type MediaQueueRunOptions = ConcurrencyEnqueueOptions

function runWithFfmpegLimit<T>(
  task: () => Promise<T>,
  options?: MediaQueueRunOptions,
): Promise<T> {
  if (ffmpegHeld.getStore()) return task()
  return ffmpegQueue.enqueue(() => ffmpegHeld.run(true, task), options)
}

function runWithFfprobeLimit<T>(
  task: () => Promise<T>,
  options?: MediaQueueRunOptions,
): Promise<T> {
  if (ffprobeHeld.getStore()) return task()
  return ffprobeQueue.enqueue(() => ffprobeHeld.run(true, task), options)
}

function runWithRemuxLimit<T>(
  task: () => Promise<T>,
  options?: MediaQueueRunOptions,
): Promise<T> {
  if (remuxHeld.getStore()) return task()
  return remuxQueue.enqueue(() => remuxHeld.run(true, task), options)
}

function runWithConversionLimit<T>(
  task: () => Promise<T>,
  options?: MediaQueueRunOptions,
): Promise<T> {
  if (conversionHeld.getStore()) return task()
  return conversionQueue.enqueue(() => conversionHeld.run(true, task), options)
}

function getMediaPostProcessQueueStats() {
  return {
    ffmpeg: ffmpegQueue.getStats(),
    ffprobe: ffprobeQueue.getStats(),
    remux: remuxQueue.getStats(),
    conversion: conversionQueue.getStats(),
  }
}

function resetMediaPostProcessQueues(): void {
  ffmpegQueue.reset()
  ffprobeQueue.reset()
  remuxQueue.reset()
  conversionQueue.reset()
}

export {
  runWithFfmpegLimit,
  runWithFfprobeLimit,
  runWithRemuxLimit,
  runWithConversionLimit,
  getMediaPostProcessQueueStats,
  resetMediaPostProcessQueues,
}
