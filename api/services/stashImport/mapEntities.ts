import type { StashEntityKind } from './types'

/** Stash ratings are 1–100; older exports used 1–5. Map to MediaChips 0–5. */
export function mapStashRatingToMediaChips(rating: number | null | undefined): number {
  if (rating == null || !Number.isFinite(Number(rating)) || Number(rating) <= 0) {
    return 0
  }
  const value = Number(rating)
  if (value <= 5) {
    return Math.max(0, Math.min(5, Math.round(value)))
  }
  return Math.max(0, Math.min(5, Math.round(value / 20)))
}

export function stashOldId(kind: StashEntityKind, id: number): string {
  return `stash:${kind}:${id}`
}

export function joinStashFilePath(folderPath: string | null | undefined, basename: string | null | undefined): string | null {
  const base = String(basename || '').trim()
  if (!base) return null
  const folder = String(folderPath || '').trim()
  if (!folder) return base

  const usesBackslash = folder.includes('\\') && !folder.includes('/')
  const sep = usesBackslash ? '\\' : '/'
  if (folder.endsWith('/') || folder.endsWith('\\')) {
    return folder + base
  }
  return `${folder}${sep}${base}`
}

export function formatSynonyms(aliases: string[]): string | null {
  const cleaned = aliases
    .map((alias) => String(alias || '').trim())
    .filter(Boolean)
  if (!cleaned.length) return null
  return cleaned.join(', ')
}

export function toIsoTimestamp(value: unknown): string | null {
  if (value == null || value === '') return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString()
  }
  const raw = String(value).trim()
  if (!raw) return null
  const parsed = Date.parse(raw)
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString()
  }
  return raw
}

export function markerTimeSeconds(seconds: number | null | undefined): number {
  if (seconds == null || !Number.isFinite(Number(seconds))) return 0
  return Math.max(0, Math.round(Number(seconds)))
}
