export interface FfprobeStream {
  codec_type?: string
  codec_name?: string
  width?: number | string
  height?: number | string
  nb_frames?: number | string
  [key: string]: unknown
}

export interface FfprobePayload {
  format?: {
    duration?: number | string
    bit_rate?: number | string
    [key: string]: unknown
  }
  streams?: FfprobeStream[]
}

export function normalizeFfprobePayload(data: FfprobePayload) {
  const format = {
    ...(data.format || {}),
    duration: Number(data.format?.duration || 0),
    bit_rate: data.format?.bit_rate,
  }

  const streams = (data.streams || []).map((stream) => ({
    ...stream,
    width: stream.width != null ? Number(stream.width) : undefined,
    height: stream.height != null ? Number(stream.height) : undefined,
    nb_frames: stream.nb_frames != null ? Number(stream.nb_frames) : undefined,
  }))

  return {format, streams}
}

export function getVideoStreamDimensions(
  probe: {streams?: FfprobeStream[]},
  fallbackAspectRatio = 16 / 9,
) {
  const videoStream = probe.streams?.find((stream) => stream.codec_type === 'video')
  const width = Number(videoStream?.width) || 0
  const height = Number(videoStream?.height) || 0

  if (width > 0 && height > 0) {
    return {
      width,
      height,
      aspectRatio: width / height,
    }
  }

  return {
    width: 0,
    height: 0,
    aspectRatio: fallbackAspectRatio,
  }
}

export function resolveThumbnailSeekSeconds(
  duration: number | string | null | undefined,
  seekRatio = 0.5,
) {
  const normalizedDuration = Number(duration || 0)

  if (!Number.isFinite(normalizedDuration) || normalizedDuration <= 0.1) {
    return 1
  }

  const seekSeconds = normalizedDuration * seekRatio
  return Math.min(
    Math.max(seekSeconds, 0),
    Math.max(normalizedDuration - 0.1, 0),
  )
}

/** Best frame pts_time at or before target from ffprobe csv stdout. */
export function pickBestKeyframePts(stdout: string, targetSeconds: number): number | null {
  const target = Math.max(0, Number(targetSeconds) || 0)
  let best: number | null = null
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const pts = Number(trimmed)
    if (!Number.isFinite(pts) || pts < 0 || pts > target + 0.05) continue
    if (best == null || pts > best) best = pts
  }
  return best
}

/** Best keyframe pts from packet csv (`pts_time,flags`) stdout. */
export function pickBestKeyframeFromPackets(stdout: string, targetSeconds: number): number | null {
  const target = Math.max(0, Number(targetSeconds) || 0)
  let best: number | null = null
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const [ptsRaw, flags = ''] = trimmed.split(',')
    if (!ptsRaw || !flags.includes('K')) continue
    const pts = Number(ptsRaw)
    if (!Number.isFinite(pts) || pts < 0 || pts > target + 0.05) continue
    if (best == null || pts > best) best = pts
  }
  return best
}

/** Ignore a bogus t≈0 keyframe hit when seeking mid-file. */
export function acceptKeyframeHit(
  frameKey: number | null,
  targetSeconds: number,
): number | null {
  if (frameKey == null) return null
  if (frameKey < 0.05 && targetSeconds > 1) return null
  return frameKey
}
