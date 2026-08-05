export type TagNameConflict = {
  tagId: number
  name: string
  existingTagId: number
}

export function buildExistingNameIndex(
  rows: Array<{id: number; name: string | null | undefined}>,
  excludeIds: Set<number>,
  normalizeName: (name: string | null | undefined) => string,
): Map<string, number> {
  const byName = new Map<string, number>()
  for (const row of rows) {
    if (excludeIds.has(row.id)) continue
    const key = normalizeName(row.name)
    if (!key || byName.has(key)) continue
    byName.set(key, row.id)
  }
  return byName
}

export function detectTagNameConflicts(
  candidates: Array<{tagId: number; name: string; key: string}>,
  existingByName: Map<string, number>,
): TagNameConflict[] {
  const conflicts: TagNameConflict[] = []
  const seen = new Set<number>()
  for (const candidate of candidates) {
    if (seen.has(candidate.tagId)) continue
    const existingTagId = existingByName.get(candidate.key)
    if (!existingTagId || existingTagId === candidate.tagId) continue
    seen.add(candidate.tagId)
    conflicts.push({
      tagId: candidate.tagId,
      name: candidate.name,
      existingTagId,
    })
  }
  return conflicts
}

export function groupTagIdsByNormalizedName(
  rows: Array<{id: number; name: string | null | undefined}>,
  normalizeName: (name: string | null | undefined) => string,
): Map<string, number[]> {
  const byName = new Map<string, number[]>()
  for (const tag of rows) {
    const key = normalizeName(tag.name)
    if (!key) continue
    const group = byName.get(key)
    if (group) group.push(tag.id)
    else byName.set(key, [tag.id])
  }
  return byName
}

/** Prefer ids in `preferredIds`, then ascending id. */
export function orderMergeGroup(ids: number[], preferredIds: Set<number>): number[] {
  return [...ids].sort((a, b) => {
    const aPreferred = preferredIds.has(a) ? 0 : 1
    const bPreferred = preferredIds.has(b) ? 0 : 1
    if (aPreferred !== bPreferred) return aPreferred - bPreferred
    return a - b
  })
}
