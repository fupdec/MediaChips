/** Pure list-face row build + cluster candidate re-rank (no DB I/O). */

import {embeddingFromJson, findTopEnrollmentMatchesForEmbeddings} from './faceMatchScoring'
import {buildClusterQueryEmbeddings} from './faceMediaMatchResolve'
import {
  groupFacesByClusterId,
  mapEnrollmentCandidateWithTag,
  pickPrimaryTagId,
  type ListedFaceCandidate,
  type TagLike,
} from './faceListPresentation'

export type ListedFaceSource = {
  id: number | string
  mediaId: number | string
  timestamp: string | null
  score: number
  x: number
  y: number
  width: number
  height: number
  cropPath: string | null
  tagId?: number | string | null
  matchScore: number | null
  matchStatus: string | null
  createdAt: string | null
  embedding?: string | null
}

export type ListedPreparedFace = {
  id: number
  mediaId: number
  timestamp: string | null
  score: number
  x: number
  y: number
  width: number
  height: number
  cropPath: string | null
  tagId: number | null
  matchScore: number | null
  matchStatus: string | null
  createdAt: string | null
  tagName: string | null
  tagMetaId: number | null
  candidates: ListedFaceCandidate[]
  embedding: Float32Array | null
}

export function parseStoredFaceEmbedding(value: unknown): Float32Array | null {
  if (!value) return null
  try {
    return embeddingFromJson(String(value))
  } catch {
    return null
  }
}

export function buildListedPreparedFace(input: {
  face: ListedFaceSource
  assignedTagId: number | null
  tag: TagLike | null | undefined
  candidates: ListedFaceCandidate[]
  embedding: Float32Array | null
}): ListedPreparedFace {
  const {face, assignedTagId, tag, candidates, embedding} = input
  return {
    id: Number(face.id),
    mediaId: Number(face.mediaId),
    timestamp: face.timestamp,
    score: face.score,
    x: face.x,
    y: face.y,
    width: face.width,
    height: face.height,
    cropPath: face.cropPath,
    tagId: assignedTagId,
    matchScore: face.matchScore,
    matchStatus: face.matchStatus,
    createdAt: face.createdAt,
    tagName: assignedTagId != null ? (tag?.name ?? null) : null,
    tagMetaId: assignedTagId != null && tag?.metaId != null ? Number(tag.metaId) : null,
    candidates,
    embedding,
  }
}

/**
 * Replace per-face candidates with a cluster-wide ranking (best-frame + consistency).
 * Mutates `clustered` members in place — same behavior as the former listFaces loop.
 */
export function reRankListedClusterCandidates<T extends {
  clusterId: number
  embedding?: Float32Array | null
  candidates: ListedFaceCandidate[]
}>(
  clustered: T[],
  enrollments: Array<{tagId: number; embedding: Float32Array}>,
  candidateLimit: number,
  resolveTag: (tagId: number) => TagLike | null | undefined,
): void {
  if (!enrollments.length) return

  for (const members of groupFacesByClusterId(clustered).values()) {
    const top = findTopEnrollmentMatchesForEmbeddings(
      buildClusterQueryEmbeddings(members.map((member) => member.embedding)),
      enrollments,
      candidateLimit,
    )
    if (!top.length) continue
    const candidates = top.map((item) => mapEnrollmentCandidateWithTag(item, resolveTag(item.tagId)))
    for (const member of members) {
      member.candidates = candidates
    }
  }
}

export {pickPrimaryTagId}
