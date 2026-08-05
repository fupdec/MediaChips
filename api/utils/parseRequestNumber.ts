/** Parse optional / clamped request query numbers. */

export function parseOptionalInt(value: unknown): number | undefined {
  if (value == null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function parseClampedLimit(value: unknown, fallback: number, max = 24): number {
  return Math.min(Math.max(Number(value) || fallback, 1), max)
}
