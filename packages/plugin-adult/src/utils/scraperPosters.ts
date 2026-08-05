import {
  SCRAPER_IMAGE_SLOTS,
  type ScraperImageAssignment,
  type ScraperImageSlot,
  type ScraperPoster,
} from '../types/scraper'

function toPositiveNumber(value: unknown): number | undefined {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return undefined
  return n
}

/** Coerce raw TPDB/CamGirlFinder poster objects into a stable shape. */
export function normalizeScraperPoster(
  poster: unknown,
  index = 0,
): ScraperPoster | null {
  if (!poster || typeof poster !== 'object') return null
  const row = poster as Record<string, unknown>
  const url = String(row.url || row.src || '').trim()
  if (!url) return null

  const size = toPositiveNumber(row.size) || 0
  const width = toPositiveNumber(row.width)
  const height = toPositiveNumber(row.height)
  const id = row.id ?? row._id ?? index

  return {
    id: id as string | number,
    url,
    size,
    ...(width != null ? {width} : {}),
    ...(height != null ? {height} : {}),
  }
}

export function getOrderedScraperPosters(posters: unknown[] = []): ScraperPoster[] {
  const normalized: ScraperPoster[] = []
  for (let index = 0; index < posters.length; index++) {
    const poster = normalizeScraperPoster(posters[index], index)
    if (poster) normalized.push(poster)
  }
  return normalized
}

export function pickPrimaryScraperPoster(posters: unknown[] = []): ScraperPoster | null {
  return getOrderedScraperPosters(posters)[0] || null
}

export function isScraperImageSlot(value: unknown): value is ScraperImageSlot {
  return typeof value === 'string' && (SCRAPER_IMAGE_SLOTS as readonly string[]).includes(value)
}

/** Next free slot in the default assignment order, or null if all are taken. */
export function nextFreeScraperImageSlot(
  assignments: Array<Pick<ScraperImageAssignment, 'type'>>,
): ScraperImageSlot | null {
  const used = new Set(assignments.map((item) => item.type))
  for (const slot of SCRAPER_IMAGE_SLOTS) {
    if (!used.has(slot)) return slot
  }
  return null
}

/**
 * Toggle a poster URL in the assignment list.
 * - If already assigned, remove it.
 * - Otherwise assign the next free slot (no-op when full).
 */
export function toggleScraperImageAssignment(
  assignments: ScraperImageAssignment[],
  url: string,
): ScraperImageAssignment[] {
  const trimmed = String(url || '').trim()
  if (!trimmed) return assignments

  const existingIndex = assignments.findIndex((item) => item.url === trimmed)
  if (existingIndex >= 0) {
    return assignments.filter((_, index) => index !== existingIndex)
  }

  const slot = nextFreeScraperImageSlot(assignments)
  if (!slot) return assignments
  return [...assignments, {url: trimmed, type: slot}]
}

/** Reassign a URL to a slot; clears any previous occupant of that slot. */
export function assignScraperImageSlot(
  assignments: ScraperImageAssignment[],
  url: string,
  type: ScraperImageSlot,
): ScraperImageAssignment[] {
  const trimmed = String(url || '').trim()
  if (!trimmed || !isScraperImageSlot(type)) return assignments

  const withoutUrlOrSlot = assignments.filter(
    (item) => item.url !== trimmed && item.type !== type,
  )
  return [...withoutUrlOrSlot, {url: trimmed, type}]
}

/** Map ordered poster URLs into the first N default slots (CamGirlFinder quick-apply). */
export function assignmentsFromPosterUrls(
  urls: string[],
  limit: number = SCRAPER_IMAGE_SLOTS.length,
): ScraperImageAssignment[] {
  const assignments: ScraperImageAssignment[] = []
  for (const url of urls) {
    if (assignments.length >= limit) break
    const trimmed = String(url || '').trim()
    if (!trimmed) continue
    const slot = SCRAPER_IMAGE_SLOTS[assignments.length]
    if (!slot) break
    assignments.push({url: trimmed, type: slot})
  }
  return assignments
}
