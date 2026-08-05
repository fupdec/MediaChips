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

export type AssignFaceToPerformerGate =
  | {ok: true; metaId: number}
  | {ok: false; error: string}

export function resolveFaceFoundGate(faceFound: boolean): {ok: true} | {ok: false; error: string} {
  if (!faceFound) return {ok: false, error: 'Face not found'}
  return {ok: true}
}

/** Validate face + performer tag before writing match fields. */
export function resolveAssignFaceToPerformerGate(input: {
  faceFound: boolean
  tagMetaId: number | null | undefined
}): AssignFaceToPerformerGate {
  const faceGate = resolveFaceFoundGate(input.faceFound)
  if (!faceGate.ok) return faceGate
  if (input.tagMetaId == null) {
    return {ok: false, error: 'Performer tag not found'}
  }
  return {ok: true, metaId: Number(input.tagMetaId)}
}

export function buildClearedFaceMatchResult(input: {
  faceId: number
  mediaId: number | string
}) {
  return {
    faceId: input.faceId,
    mediaId: Number(input.mediaId),
    tagId: null as null,
    matchStatus: 'unmatched' as const,
  }
}

/** Keep only media ids that still exist in the library. */
export function filterExistingMediaIds(
  mediaIds: Array<number | string>,
  exists: (id: number) => boolean,
): number[] {
  return mediaIds
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && exists(id))
}
