/** Shared live-stream chunk timing (API + UI). */

export const LIVE_STREAM_CHUNK_SECONDS = 30
/** How close to the segment end (seconds) before handing off to the next chunk. */
export const LIVE_STREAM_CHUNK_HANDOFF_SECONDS = 0.15

export function getChunkStart(
  time: number | string | null | undefined,
  chunkDuration = LIVE_STREAM_CHUNK_SECONDS,
): number {
  const seconds = Math.max(0, Number(time) || 0)
  return Math.floor(seconds / chunkDuration) * chunkDuration
}

export function getChunkDuration({
  chunkStart,
  fileDuration,
  chunkDuration = LIVE_STREAM_CHUNK_SECONDS,
}: {
  chunkStart: number
  fileDuration?: number | null
  chunkDuration?: number
}): number {
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
export function getLiveStreamOutputDuration({
  streamStart,
  fileDuration,
}: {
  streamStart: number
  fileDuration?: number | null
}): number | null {
  const start = Math.max(0, Number(streamStart) || 0)
  const total = Number(fileDuration)
  if (!Number.isFinite(total) || total <= 0 || total <= start) {
    return null
  }

  return Math.max(0, total - start)
}

/**
 * Next live-stream chunk start, or null at known EOF.
 * When file duration is unknown (null/0), keep advancing — the stream layer
 * will fail at the real end.
 */
export function getNextChunkStart(
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

/**
 * Continuous handoff: next chunk starts exactly where the current segment ended.
 */
export function getContinuousNextChunkStart(
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

/**
 * Prefer real file duration from metadata. Ignore chunk-sized store durations
 * once playback has moved past the first chunk.
 */
export function resolveLiveFileDuration({
  metadataDuration,
  storeDuration,
  liveStreamOffset = 0,
  chunkDuration = LIVE_STREAM_CHUNK_SECONDS,
}: {
  metadataDuration?: number | null
  storeDuration?: number | null
  liveStreamOffset?: number
  chunkDuration?: number
}): number | null {
  const meta = Number(metadataDuration)
  if (Number.isFinite(meta) && meta > 0) return meta

  const stored = Number(storeDuration)
  if (!Number.isFinite(stored) || stored <= 0) return null

  if (liveStreamOffset > 0 && stored <= chunkDuration + 1) {
    return null
  }

  return stored
}
