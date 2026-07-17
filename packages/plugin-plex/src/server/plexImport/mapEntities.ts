export function normalizePlexBaseUrl(baseUrl: string): string {
  return String(baseUrl || '').trim().replace(/\/+$/, '')
}

export function plexOldId(kind: string, id: string | number): string {
  return `plex:${kind}:${id}`
}

/** Plex ratings are 0–10; MediaChips stores ratings on a 0–5 scale. */
export function mapPlexRating(rating: number | null | undefined): number | null {
  if (rating == null || Number.isNaN(Number(rating))) return null
  return Math.max(0, Math.min(5, Math.round((Number(rating) / 2) * 10) / 10))
}

export function msToSeconds(milliseconds: number | null | undefined): number | null {
  if (milliseconds == null || Number.isNaN(Number(milliseconds))) return null
  return Math.max(0, Math.round(Number(milliseconds) / 1000))
}
