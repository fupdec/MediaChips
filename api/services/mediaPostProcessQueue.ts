import { createConcurrencyQueue } from './concurrencyQueue'

const ffmpegQueue = createConcurrencyQueue(1)
const ffprobeQueue = createConcurrencyQueue(2)
const contentHashQueue = createConcurrencyQueue(2)

function runWithFfmpegLimit<T>(task: () => Promise<T>): Promise<T> {
  return ffmpegQueue.enqueue(task)
}

function runWithFfprobeLimit<T>(task: () => Promise<T>): Promise<T> {
  return ffprobeQueue.enqueue(task)
}

function enqueueContentHash(task: () => Promise<void>): void {
  contentHashQueue.enqueueVoid(task)
}

function getMediaPostProcessQueueStats() {
  return {
    ffmpeg: ffmpegQueue.getStats(),
    ffprobe: ffprobeQueue.getStats(),
    contentHash: contentHashQueue.getStats(),
  }
}

function resetMediaPostProcessQueues(): void {
  ffmpegQueue.reset()
  ffprobeQueue.reset()
  contentHashQueue.reset()
}

export {
  runWithFfmpegLimit,
  runWithFfprobeLimit,
  enqueueContentHash,
  getMediaPostProcessQueueStats,
  resetMediaPostProcessQueues,
}
