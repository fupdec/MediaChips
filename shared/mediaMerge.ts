export type MediaSurvivorCandidate = {
  id: number
  filesize?: number | null
  rating?: number | null
  createdAt?: string | null
}

/** Default survivor: max filesize → max rating → oldest createdAt → lowest id. */
export function pickDefaultSurvivorId(rows: MediaSurvivorCandidate[]): number | null {
  if (!rows.length) return null
  const sorted = [...rows].sort((a, b) => {
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
