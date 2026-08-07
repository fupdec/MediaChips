export type MediaSurvivorCandidate = {
  id: number
  filesize?: number | null
  rating?: number | null
  createdAt?: string | null
  width?: number | null
  height?: number | null
  /** Pixel area (width * height) when known; higher is better. */
  resolutionScore?: number | null
}

export function resolutionScoreForMedia(row: {
  resolutionScore?: number | null
  width?: number | null
  height?: number | null
}): number {
  const explicit = Number(row.resolutionScore)
  if (Number.isFinite(explicit) && explicit > 0) return explicit
  const width = Number(row.width || 0)
  const height = Number(row.height || 0)
  if (width > 0 && height > 0) return width * height
  return 0
}

/** Default survivor: max resolution → max filesize → max rating → oldest createdAt → lowest id. */
export function pickDefaultSurvivorId(rows: MediaSurvivorCandidate[]): number | null {
  if (!rows.length) return null
  const sorted = [...rows].sort((a, b) => {
    const resDiff = resolutionScoreForMedia(b) - resolutionScoreForMedia(a)
    if (resDiff !== 0) return resDiff
    const sizeDiff = Number(b.filesize || 0) - Number(a.filesize || 0)
    if (sizeDiff !== 0) return sizeDiff
    const ratingDiff = Number(b.rating || 0) - Number(a.rating || 0)
    if (ratingDiff !== 0) return ratingDiff
    const aCreated = String(a.createdAt || '')
    const bCreated = String(b.createdAt || '')
    if (aCreated !== bCreated) return aCreated < bCreated ? -1 : 1
    return Number(a.id) - Number(b.id)
  })
  return Number(sorted[0]?.id) || null
}
