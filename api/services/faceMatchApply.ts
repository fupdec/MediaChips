export type FaceMatchMode = 'suggest' | 'auto'

export type MatchCandidatePick = {
  accepted: boolean
  ambiguous: boolean
  best?: {tagId: number; score: number} | null
}

export type FaceMatchUpdate = {
  tagId: number | null
  matchScore: number | null
  matchStatus: 'matched' | 'suggested' | 'unmatched'
}

/** Map a cluster pick + mode onto the persisted face match fields. */
export function resolveClusterMatchUpdate(
  pick: MatchCandidatePick,
  mode: FaceMatchMode,
): FaceMatchUpdate {
  if (pick.best && pick.accepted) {
    return {
      tagId: pick.best.tagId,
      matchScore: pick.best.score,
      matchStatus: mode === 'auto' ? 'matched' : 'suggested',
    }
  }
  if (pick.best && pick.ambiguous) {
    return {
      tagId: pick.best.tagId,
      matchScore: pick.best.score,
      matchStatus: 'suggested',
    }
  }
  return {
    tagId: null,
    matchScore: pick.best && pick.best.score > 0 ? pick.best.score : null,
    matchStatus: 'unmatched',
  }
}

export type MediaTagApply = {
  mediaId: number
  tagId: number
  metaId: number
}

export function uniqueMediaTagApplies(items: MediaTagApply[]): MediaTagApply[] {
  const unique = new Map<string, MediaTagApply>()
  for (const item of items) {
    unique.set(`${item.mediaId}:${item.tagId}:${item.metaId}`, item)
  }
  return [...unique.values()]
}

export type StoredFaceMatchGate = 'skip-assigned' | 'skip-unmatchable' | 'embed'

export function classifyStoredFaceForMatch(input: {
  hasTagId: boolean
  force?: boolean
  isMatchable: boolean
}): StoredFaceMatchGate {
  if (input.hasTagId && !input.force) return 'skip-assigned'
  if (!input.isMatchable) return 'skip-unmatchable'
  return 'embed'
}
