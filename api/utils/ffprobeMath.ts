export interface FfprobeStream {
  codec_type?: string
  codec_name?: string
  width?: number | string
  height?: number | string
  nb_frames?: number | string
  avg_frame_rate?: string
  r_frame_rate?: string
  [key: string]: unknown
}

export interface FfprobePayload {
  format?: {
    duration?: number | string
    bit_rate?: number | string
    size?: number | string
    [key: string]: unknown
  }
  streams?: FfprobeStream[]
}

export function normalizeFfprobePayload(data: FfprobePayload) {
  const rawDuration = data.format?.duration
  const parsedDuration = rawDuration == null || rawDuration === ''
    ? 0
    : Number(rawDuration)
  const rawBitRate = data.format?.bit_rate
  const parsedBitRate = rawBitRate == null || rawBitRate === ''
    ? undefined
    : Number(rawBitRate)
  const rawSize = data.format?.size
  const parsedSize = rawSize == null || rawSize === ''
    ? undefined
    : Number(rawSize)

  const format = {
    ...(data.format || {}),
    duration: Number.isFinite(parsedDuration) ? parsedDuration : 0,
    bit_rate: Number.isFinite(parsedBitRate as number) ? parsedBitRate : undefined,
    size: Number.isFinite(parsedSize as number) ? parsedSize : undefined,
  }

  const streams = (data.streams || []).map((stream) => ({
    ...stream,
    width: stream.width != null ? Number(stream.width) : undefined,
    height: stream.height != null ? Number(stream.height) : undefined,
    nb_frames: stream.nb_frames != null ? Number(stream.nb_frames) : undefined,
  }))

  return {format, streams}
}

/** Parse ffprobe `avg_frame_rate` / `r_frame_rate` (`30/1`, `1000/33`). */
export function parseFrameRate(rate: unknown): number | undefined {
  if (rate == null || rate === '') return undefined
  if (typeof rate === 'number') {
    return Number.isFinite(rate) && rate > 0 ? rate : undefined
  }

  const text = String(rate).trim()
  const fraction = text.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/)
  if (fraction) {
    const numerator = Number(fraction[1])
    const denominator = Number(fraction[2])
    if (denominator > 0 && numerator > 0 && Number.isFinite(numerator / denominator)) {
      return numerator / denominator
    }
    return undefined
  }

  const value = Number(text)
  return Number.isFinite(value) && value > 0 ? value : undefined
}

export function resolveStreamFps(
  stream: FfprobeStream | undefined,
  durationSeconds?: number,
): number | undefined {
  if (!stream) return undefined

  const fromRate = parseFrameRate(stream.avg_frame_rate) ?? parseFrameRate(stream.r_frame_rate)
  if (fromRate != null) {
    return Math.ceil(fromRate)
  }

  const frames = stream.nb_frames != null ? Number(stream.nb_frames) : NaN
  const duration = Number(durationSeconds)
  if (Number.isFinite(frames) && frames > 0 && Number.isFinite(duration) && duration > 0) {
    return Math.ceil(frames / duration)
  }

  return undefined
}

/** Last finite pts_time from ffprobe csv (`p=0`) packet output. */
export function pickLastPtsFromCsv(stdout: string): number | null {
  let best: number | null = null
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const pts = Number(trimmed.split(',')[0])
    if (!Number.isFinite(pts) || pts < 0) continue
    if (best == null || pts > best) best = pts
  }
  return best
}

export function isUsableDuration(duration: unknown): duration is number {
  return typeof duration === 'number' && Number.isFinite(duration) && duration >= 1
}

/** Prefer container duration; fall back to packet PTS (Chrome WebM often omits duration). */
export function resolveDurationSeconds(
  formatDuration: unknown,
  packetPts: number | null | undefined,
): number | null {
  if (isUsableDuration(Number(formatDuration))) {
    return Number(formatDuration)
  }
  if (packetPts != null && isUsableDuration(packetPts)) {
    return packetPts
  }
  return null
}

export function estimateBitrate(sizeBytes: unknown, durationSeconds: number): number | undefined {
  const size = Number(sizeBytes)
  if (!Number.isFinite(size) || size <= 0 || !isUsableDuration(durationSeconds)) {
    return undefined
  }
  return Math.round((size * 8) / durationSeconds)
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
