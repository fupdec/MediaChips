export type MarkTimeParts = {
  hours: number
  minutes: number
  seconds: number
}

export function splitSecondsToHms(totalSeconds: unknown): MarkTimeParts {
  const total = Math.max(0, Math.floor(Number(totalSeconds) || 0))
  return {
    hours: Math.floor(total / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  }
}

export function joinHmsToSeconds(
  hours: unknown,
  minutes: unknown,
  seconds: unknown,
  { maxSeconds }: { maxSeconds?: number } = {},
): number {
  const h = Math.max(0, Math.floor(Number(hours) || 0))
  const m = Math.max(0, Math.min(59, Math.floor(Number(minutes) || 0)))
  const s = Math.max(0, Math.min(59, Math.floor(Number(seconds) || 0)))
  let total = h * 3600 + m * 60 + s
  if (typeof maxSeconds === 'number' && Number.isFinite(maxSeconds) && maxSeconds >= 0) {
    total = Math.min(total, Math.floor(maxSeconds))
  }
  return Math.max(0, total)
}

export function clampMarkSeconds(value: unknown, min = 0, max?: number): number {
  let next = Math.max(min, Math.floor(Number(value) || 0))
  if (typeof max === 'number' && Number.isFinite(max)) {
    next = Math.min(next, Math.floor(max))
  }
  return Math.max(0, next)
}
