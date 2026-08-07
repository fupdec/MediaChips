/** Pure prepare + cluster match resolve for media face matching (no DB I/O). */

import {
  averageEmbeddings,
  findTopEnrollmentMatches,
  findTopEnrollmentMatchesForEmbeddings,
  pickMatchFromCandidates,
} from './faceMatchScoring'
import {
  classifyStoredFaceForMatch,
  resolveClusterMatchUpdate,
  type FaceMatchMode,
  type FaceMatchUpdate,
  type MediaTagApply,
} from './faceMatchApply'

export type MatchPreparedFace = {
  id: number
  tagId: number | null
  matchScore: number | null
  score: number
  timestamp: string | null
  skip: boolean
  candidates?: Array<{tagId: number; score: number}>
  embedding?: Float32Array | null
}

export type MatchPreparedFaceBase = {
  id: number
  score: number
  timestamp: string | null
}

/** Already-assigned / unmatchable / missing-embed / load-error faces stay skipped. */
export function buildSkippedMatchPreparedFace(
  base: MatchPreparedFaceBase,
  options: {tagId?: number | null; matchScore?: number | null} = {},
): MatchPreparedFace {
  return {
    id: base.id,
    tagId: options.tagId ?? null,
    matchScore: options.matchScore ?? null,
    score: base.score,
    timestamp: base.timestamp,
    skip: true,
    embedding: null,
  }
}

export function buildReadyMatchPreparedFace(
  base: MatchPreparedFaceBase,
  candidates: Array<{tagId: number; score: number}>,
  embedding: Float32Array,
): MatchPreparedFace {
  return {
    id: base.id,
    tagId: null,
    matchScore: null,
    score: base.score,
    timestamp: base.timestamp,
    skip: false,
    candidates,
    embedding,
  }
}

export type MatchFaceSource = {
  id: number | string
  score?: number | null
  timestamp?: string | null
  tagId?: number | string | null
  matchScore?: number | null
  width?: number | null
  height?: number | null
  embedding?: string | null
  cropPath?: string | null
}

/**
 * Gate each stored face into skip/ready prepare records.
 * Embedding load stays injectable so ORT/DB stay in the caller.
 */
export async function prepareMatchFacesForMedia(input: {
  faces: MatchFaceSource[]
  force?: boolean
  enrollments: Array<{tagId: number; embedding: Float32Array}>
  candidateLimit: number
  loadEmbedding: (face: MatchFaceSource) => Promise<Float32Array | null>
  isMatchable: (face: MatchFaceSource) => boolean
}): Promise<{prepared: MatchPreparedFace[]; skipped: number}> {
  const {faces, force, enrollments, candidateLimit, loadEmbedding, isMatchable} = input
  const prepared: MatchPreparedFace[] = []
  let skipped = 0

  for (const face of faces) {
    const base = {
      id: Number(face.id),
      score: Number(face.score) || 0,
      timestamp: face.timestamp ?? null,
    }
    const gate = classifyStoredFaceForMatch({
      hasTagId: Boolean(face.tagId),
      force,
      isMatchable: isMatchable(face),
    })

    if (gate === 'skip-assigned') {
      skipped += 1
      prepared.push(buildSkippedMatchPreparedFace(base, {
        tagId: Number(face.tagId),
        matchScore: face.matchScore ?? null,
      }))
      continue
    }

    if (gate === 'skip-unmatchable') {
      skipped += 1
      prepared.push(buildSkippedMatchPreparedFace(base))
      continue
    }

    try {
      const embedding = await loadEmbedding(face)
      if (!embedding) {
        skipped += 1
        prepared.push(buildSkippedMatchPreparedFace(base))
        continue
      }
      const candidates = findTopEnrollmentMatches(embedding, enrollments, candidateLimit)
      prepared.push(buildReadyMatchPreparedFace(base, candidates, embedding))
    } catch {
      skipped += 1
      prepared.push(buildSkippedMatchPreparedFace(base))
    }
  }

  return {prepared, skipped}
}

/** Member frames plus centroid — same query shape used by match and list re-rank. */
export function buildClusterQueryEmbeddings(
  embeddings: Array<Float32Array | null | undefined>,
): Array<Float32Array | null | undefined> {
  return [
    ...embeddings,
    averageEmbeddings(embeddings),
  ]
}

export type ClusteredMatchFace = MatchPreparedFace & {
  clusterId: number
}

export type ClusterMatchResolveResult = {
  updates: Array<{faceId: number; update: FaceMatchUpdate}>
  tagsToApply: MediaTagApply[]
  matched: number
}

export type MatchMediaFacesResult = {
  matched: number
  applied: number
  skipped: number
  faces: number
  blindTagsCreated?: number
  blindFacesApplied?: number
  error?: string
}

export type MatchMediaFacesGate =
  | {ok: true}
  | {ok: false; result: MatchMediaFacesResult}

/** Early-exit gates before embedding / prepare for matchMediaFaces. */
export function resolveMatchMediaFacesGate(input: {
  metaId: number | null | undefined
  facesCount: number
  enrollmentsCount: number
}): MatchMediaFacesGate {
  if (!input.metaId) {
    return {
      ok: false,
      result: {
        matched: 0,
        applied: 0,
        skipped: 0,
        faces: 0,
        error: 'Performer category is not configured.',
      },
    }
  }
  if (!input.facesCount) {
    return {ok: false, result: {matched: 0, applied: 0, skipped: 0, faces: 0}}
  }
  if (!input.enrollmentsCount) {
    return {
      ok: false,
      result: {
        matched: 0,
        applied: 0,
        skipped: input.facesCount,
        faces: input.facesCount,
        error: 'No enrolled performer faces.',
      },
    }
  }
  return {ok: true}
}

/**
 * For each unskipped cluster, pick an enrollment and emit per-member updates + optional tag applies.
 * Persistence stays in the caller.
 */
export function resolveClusterMatchesForMedia(input: {
  clustered: ClusteredMatchFace[]
  enrollments: Array<{tagId: number; embedding: Float32Array}>
  candidateLimit: number
  minConfidence: number
  mode: FaceMatchMode
  mediaId: number
  metaId: number
}): ClusterMatchResolveResult {
  const {clustered, enrollments, candidateLimit, minConfidence, mode, mediaId, metaId} = input
  const updates: Array<{faceId: number; update: FaceMatchUpdate}> = []
  const tagsToApply: MediaTagApply[] = []
  let matched = 0
  const handledClusters = new Set<number>()

  for (const face of clustered) {
    if (face.skip || handledClusters.has(face.clusterId)) continue
    handledClusters.add(face.clusterId)

    const members = clustered.filter((entry) => entry.clusterId === face.clusterId && !entry.skip)
    if (!members.length) continue

    const candidates = findTopEnrollmentMatchesForEmbeddings(
      buildClusterQueryEmbeddings(members.map((member) => member.embedding)),
      enrollments,
      candidateLimit,
    )
    const pick = pickMatchFromCandidates(candidates, minConfidence)
    const update = resolveClusterMatchUpdate(pick, mode)

    for (const member of members) {
      updates.push({faceId: member.id, update})
      if (pick.best && (pick.accepted || pick.ambiguous)) {
        matched += 1
        if (pick.accepted && mode === 'auto' && update.tagId != null) {
          tagsToApply.push({mediaId, tagId: update.tagId, metaId})
        }
      }
    }
  }

  return {updates, tagsToApply, matched}
}
