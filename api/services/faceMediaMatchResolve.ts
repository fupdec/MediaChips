/** Pure prepare + cluster match resolve for media face matching (no DB I/O). */

import {
  averageEmbeddings,
  findTopEnrollmentMatchesForEmbeddings,
  pickMatchFromCandidates,
} from './faceMatchScoring'
import {
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

/** Member frames plus centroid — same query shape used by match and list re-rank. */
export function buildClusterQueryEmbeddings(
  embeddings: Array<Float32Array | null | undefined>,
): Array<Float32Array | null> {
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
