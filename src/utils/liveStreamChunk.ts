export const LIVE_STREAM_CHUNK_SECONDS = 30
export const LIVE_STREAM_PREFETCH_SECONDS = 8

export function getChunkStart(time: number, chunkDuration = LIVE_STREAM_CHUNK_SECONDS): number {
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
 * Next live-stream chunk start, or null at known EOF.
 * When file duration is unknown (null/0), keep advancing — the stream layer
 * will fail at the real end. This avoids treating a short video-element
 * duration (one chunk) as the whole file and jumping the playlist early.
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
 * Prefer real file duration from metadata. Ignore chunk-sized store durations
 * once playback has moved past the first chunk — those usually come from the
 * video element's duration of a single live-transcode segment.
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
