export const MIN_TRIM_SECONDS = 0.25
export const FULL_RANGE_EPSILON = 0.2

export function clampTrimValue(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

export function normalizeTrimRange(
  startSeconds: number,
  endSeconds: number,
  durationSeconds: number,
): {start: number; end: number; duration: number} {
  const duration = Math.max(0, Number(durationSeconds) || 0)
  const start = clampTrimValue(Number(startSeconds) || 0, 0, duration)
  const end = clampTrimValue(Number(endSeconds) || 0, 0, duration)
  const lo = Math.min(start, end)
  const hi = Math.max(start, end)
  return {
    start: lo,
    end: hi,
    duration: Math.max(0, hi - lo),
  }
}

export function isFullDurationTrim(
  startSeconds: number,
  endSeconds: number,
  durationSeconds: number,
): boolean {
  const range = normalizeTrimRange(startSeconds, endSeconds, durationSeconds)
  if (range.duration <= 0) return true
  const sourceDuration = Number(durationSeconds) || 0
  return range.start <= FULL_RANGE_EPSILON
    && Math.abs(sourceDuration - range.duration) <= FULL_RANGE_EPSILON
}

export function canApplyTrim(
  startSeconds: number,
  endSeconds: number,
  durationSeconds: number,
): boolean {
  const range = normalizeTrimRange(startSeconds, endSeconds, durationSeconds)
  if (range.duration < MIN_TRIM_SECONDS) return false
  return !isFullDurationTrim(range.start, range.end, durationSeconds)
}

export function allocateUniqueMediaPath(
  directory: string,
  stem: string,
  ext: string,
  exists: (filePath: string) => boolean,
  joinPath: (dir: string, name: string) => string,
): string {
  const suffix = ext.startsWith('.') || !ext ? ext : `.${ext}`
  let candidate = joinPath(directory, `${stem}${suffix}`)
  let index = 1
  while (exists(candidate)) {
    index += 1
    candidate = joinPath(directory, `${stem}_${index}${suffix}`)
  }
  return candidate
}
