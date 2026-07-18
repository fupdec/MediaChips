import { createConcurrencyQueue } from './concurrencyQueue'

const ffmpegQueue = createConcurrencyQueue(1)
const ffprobeQueue = createConcurrencyQueue(2)

function runWithFfmpegLimit<T>(task: () => Promise<T>): Promise<T> {
  return ffmpegQueue.enqueue(task)
}

function runWithFfprobeLimit<T>(task: () => Promise<T>): Promise<T> {
  return ffprobeQueue.enqueue(task)
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
