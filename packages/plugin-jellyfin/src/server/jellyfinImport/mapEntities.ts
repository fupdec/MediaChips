import type {JellyfinOldIdPrefix} from './types'

export function normalizeJellyfinBaseUrl(baseUrl: string): string {
  return String(baseUrl || '').trim().replace(/\/+$/, '')
}

export function jellyfinOldId(
  prefix: JellyfinOldIdPrefix,
  kind: string,
  id: string | number,
): string {
  return `${prefix}:${kind}:${id}`
}

/** Jellyfin community rating is typically 0–10 → MediaChips 0–5. */
export function mapJellyfinRatingToMediaChips(rating: number | null | undefined): number | null {
  if (rating == null || Number.isNaN(Number(rating))) return null
  const value = Number(rating)
  if (value <= 0) return 0
  if (value <= 5) return Math.min(5, Math.round(value * 10) / 10)
  return Math.min(5, Math.round((value / 2) * 10) / 10)
}

/** 10_000_000 ticks = 1 second */
export function ticksToSeconds(ticks: number | null | undefined): number | null {
  if (ticks == null || Number.isNaN(Number(ticks))) return null
  return Math.round(Number(ticks) / 10_000_000)
}

export function markerTimeSeconds(seconds: number): number {
  return Math.max(0, Math.round(Number(seconds) || 0))
}
