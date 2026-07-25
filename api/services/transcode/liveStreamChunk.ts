const LIVE_STREAM_CHUNK_SECONDS = 30
const LIVE_STREAM_CHUNK_HANDOFF_SECONDS = 0.15

function getChunkStart(time: number | string | null | undefined, chunkDuration = LIVE_STREAM_CHUNK_SECONDS): number {
  const seconds = Math.max(0, Number(time) || 0)
  return Math.floor(seconds / chunkDuration) * chunkDuration
}

interface ChunkDurationOptions {
  chunkStart: number
  fileDuration: number | null | undefined
  chunkDuration?: number
}

function getChunkDuration({
  chunkStart,
  fileDuration,
  chunkDuration = LIVE_STREAM_CHUNK_SECONDS,
}: ChunkDurationOptions): number {
  if (!fileDuration || fileDuration <= chunkStart) {
    return chunkDuration
  }

  return Math.min(chunkDuration, Math.max(0, fileDuration - chunkStart))
}

/**
 * Duration for a continuous live-transcode pipe from streamStart to EOF.
 * Returns null when the file length is unknown so ffmpeg runs until the
 * input ends (no fixed 30s chunk cuts).
 */
function getLiveStreamOutputDuration({
  streamStart,
  fileDuration,
}: {
  streamStart: number
  fileDuration: number | null | undefined
}): number | null {
  const start = Math.max(0, Number(streamStart) || 0)
  const total = Number(fileDuration)
  if (!Number.isFinite(total) || total <= 0 || total <= start) {
    return null
  }

  return Math.max(0, total - start)
}

function getNextChunkStart(
  chunkStart: number,
  fileDuration: number | null | undefined,
  chunkDuration = LIVE_STREAM_CHUNK_SECONDS,
): number | null {
  const next = chunkStart + chunkDuration
  const knownDuration = Number(fileDuration)
  if (Number.isFinite(knownDuration) && knownDuration > 0 && next >= knownDuration - 0.25) {
    return null
  }

  return next
}

function getContinuousNextChunkStart(
  chunkStart: number,
  segmentDuration: number | null | undefined,
  fileDuration: number | null | undefined,
  fallbackChunkDuration = LIVE_STREAM_CHUNK_SECONDS,
): number | null {
  const elapsed = Number(segmentDuration)
  const step = Number.isFinite(elapsed) && elapsed > 0.05
    ? elapsed
    : fallbackChunkDuration
  const next = Math.max(0, Number(chunkStart) || 0) + step
  const knownDuration = Number(fileDuration)
  if (Number.isFinite(knownDuration) && knownDuration > 0 && next >= knownDuration - 0.05) {
    return null
  }

  return next
}

export {
  LIVE_STREAM_CHUNK_SECONDS,
  LIVE_STREAM_CHUNK_HANDOFF_SECONDS,
  getChunkStart,
  getChunkDuration,
  getLiveStreamOutputDuration,
  getNextChunkStart,
  getContinuousNextChunkStart,
}
