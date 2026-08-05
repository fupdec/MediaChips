import type { FaceBox } from '../types/faceDetector'

/** Pure detector helpers (no ORT / ffmpeg / Jimp). */

export function qualityGatesForScore(minScore: number) {
  // Loose (~0.5) → almost no skin/area gates; strict (~0.75) → moderate gates.
  // Keep the curve gentle: high scores alone already reject weak boxes.
  const t = Math.min(1, Math.max(0, (minScore - 0.55) / 0.2))
  return {
    maxSkinRatio: 0.95 - (t * 0.12),
    minUpperDarkRatio: 0.02 + (t * 0.03),
    maxAreaRatio: 0.5 - (t * 0.15),
    minLumaStd: 12 + (t * 3),
    applySkinFilter: minScore >= 0.7,
  }
}

export function formatTimestamp(seconds: number) {
  return new Date(Math.floor(Math.max(0, seconds)) * 1000).toISOString().substr(11, 8)
}

/**
 * Bias samples toward the first ~2/3 of usable runtime (faces rarely appear in credits),
 * and pad away from pure black intro/outro frames.
 */
export function getFrameTimestamps(duration: number, count: number) {
  const safeCount = Math.max(1, Math.min(Number(count || 6), 99))
  const safeDuration = Math.max(0.1, Number(duration) || 0.1)
  if (safeCount === 1) {
    return [formatTimestamp(safeDuration * 0.42)]
  }

  const startPad = safeDuration < 20 ? 0.08 : 0.05
  const endPad = safeDuration < 20 ? 0.1 : 0.14
  const usable = Math.max(0.25, 1 - startPad - endPad)

  return Array.from({length: safeCount}, (_, index) => {
    const u = index / (safeCount - 1)
    // Power < 1 → denser early/mid samples.
    const biased = Math.pow(u, 0.72)
    return formatTimestamp(safeDuration * (startPad + usable * biased))
  })
}

/** Oversample timestamps, then keep `targetCount` diverse frames. */
export function computeOversampledFrameCount(framesPerVideo: number): {
  targetCount: number
  candidateCount: number
} {
  const targetCount = Math.max(1, Math.min(99, Math.round(framesPerVideo) || 6))
  const candidateCount = Math.min(99, Math.max(targetCount, Math.ceil(targetCount * 1.75)))
  return {targetCount, candidateCount}
}

/** Average-hash bitstring from luma samples (e.g. 8x8 greyscale pixels). */
export function averageHashFromLumaValues(values: number[]): string {
  if (!values.length) return ''
  let sum = 0
  for (const value of values) sum += value
  const avg = sum / values.length
  return values.map((value) => (value >= avg ? '1' : '0')).join('')
}

export function groupItemsByKey<T>(
  items: T[],
  getKey: (item: T) => string,
): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = getKey(item)
    const list = groups.get(key) || []
    list.push(item)
    groups.set(key, list)
  }
  return groups
}

export function hammingDistance(a: string, b: string) {
  const n = Math.min(a.length, b.length)
  let d = 0
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) d += 1
  }
  return d + Math.abs(a.length - b.length)
}

/**
 * Keep frames that look different enough (aHash Hamming ≥ threshold).
 * Falls back to originals if almost everything collides.
 */
export function pickDiverseFrames<T extends {fingerprint: string}>(
  frames: T[],
  limit: number,
  minDistance: number = 10,
): T[] {
  if (frames.length <= limit) return frames
  const kept: T[] = []
  for (const frame of frames) {
    if (kept.every((other) => hammingDistance(frame.fingerprint, other.fingerprint) >= minDistance)) {
      kept.push(frame)
    }
    if (kept.length >= limit) break
  }
  if (kept.length >= Math.min(limit, Math.ceil(limit * 0.5))) return kept.slice(0, limit)
  // Too aggressive — keep first N candidates in planned order.
  return frames.slice(0, limit)
}

export function iou(a: FaceBox, b: FaceBox) {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.width, b.x + b.width)
  const y2 = Math.min(a.y + a.height, b.y + b.height)
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  const union = a.width * a.height + b.width * b.height - inter
  return union > 0 ? inter / union : 0
}

export function hardNms<T extends {score: number; box: FaceBox}>(
  detections: T[],
  iouThreshold: number,
  topK: number,
): T[] {
  const sorted = [...detections].sort((a, b) => b.score - a.score)
  const kept: T[] = []

  for (const candidate of sorted) {
    if (kept.some((existing) => iou(existing.box, candidate.box) > iouThreshold)) continue
    kept.push(candidate)
    if (kept.length >= topK) break
  }

  return kept
}
