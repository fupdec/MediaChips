const LIVE_STREAM_CHUNK_SECONDS = 30
const LIVE_STREAM_PREFETCH_SECONDS = 8

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

export {
  LIVE_STREAM_CHUNK_SECONDS,
  LIVE_STREAM_PREFETCH_SECONDS,
  getChunkStart,
  getChunkDuration,
  getNextChunkStart,
}

