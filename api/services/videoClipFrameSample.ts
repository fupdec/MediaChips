import {formatTimestamp} from './faceDetectorMath'

/** Uniform mid-range sampling for clip tagger (not face early-bias). */
export function getClipFrameTimestamps(duration: number, count: number) {
  const safeCount = Math.max(1, Math.min(Number(count || 4), 10))
  const ratios = safeCount === 1
    ? [0.5]
    : Array.from({length: safeCount}, (_, index) => 0.15 + (0.75 * (index / (safeCount - 1))))

  return ratios.map((ratio) => formatTimestamp(duration * ratio))
}

export function normalizeClipTagName(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
}
