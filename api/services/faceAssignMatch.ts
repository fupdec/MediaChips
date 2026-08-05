/** Pure helpers for manual face ↔ performer assign / clear. */

export function resolveAssignMatchFields(input: {
  applyTag: boolean
  matchScore?: number | null
  existingMatchScore?: number | null
}): {matchScore: number; matchStatus: 'manual' | 'suggested'} {
  const matchScore = input.matchScore != null
    ? Number(input.matchScore)
    : (input.applyTag ? 1 : (Number(input.existingMatchScore) || 1))
  return {
    matchScore,
    // Draft pick stays suggested until the user commits tags to media.
    matchStatus: input.applyTag ? 'manual' : 'suggested',
  }
}

export function buildClearedFaceMatchUpdate() {
  return {
    tagId: null as number | null,
    matchScore: null as number | null,
    matchStatus: 'unmatched' as const,
  }
}
