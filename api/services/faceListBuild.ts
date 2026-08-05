/** Pure list-faces pipeline: row → prepared → clustered response. */

import {isMatchableStoredFace} from './matchGates'
import {clusterFacesInMedia} from './faceCluster'
import {findTopEnrollmentMatches} from './faceMatchScoring'
import {mapEnrollmentCandidateWithTag, stripEmbeddingsFromFaces, type TagLike} from './faceListPresentation'
import {
  buildListedPreparedFace,
  parseStoredFaceEmbedding,
  pickPrimaryTagId,
  reRankListedClusterCandidates,
  type ListedFaceSource,
  type ListedPreparedFace,
} from './faceListMatchEnrich'

export function buildListedPreparedFacesFromRows(input: {
  faceRows: ListedFaceSource[]
  enrollmentRefs: Array<{tagId: number; embedding: Float32Array}>
  candidateLimit: number
  resolveTag: (tagId: number) => TagLike | null | undefined
  isMatchable?: (face: ListedFaceSource) => boolean
}): ListedPreparedFace[] {
  const {
    faceRows,
    enrollmentRefs,
    candidateLimit,
    resolveTag,
    isMatchable = isMatchableStoredFace,
  } = input
  const prepared: ListedPreparedFace[] = []

  for (const face of faceRows) {
    let candidates: Array<{tagId: number; score: number; tagName: string | null; tagMetaId: number | null}> = []
    const embedding = parseStoredFaceEmbedding(face.embedding)
    if (embedding && enrollmentRefs.length && isMatchable(face)) {
      const top = findTopEnrollmentMatches(embedding, enrollmentRefs, candidateLimit)
      candidates = top.map((item) => mapEnrollmentCandidateWithTag(item, resolveTag(item.tagId)))
    }

    const assignedTagId = face.tagId != null ? Number(face.tagId) : null
    const primaryTagId = pickPrimaryTagId(assignedTagId, candidates)
    const tag = primaryTagId != null ? resolveTag(primaryTagId) : undefined
    prepared.push(buildListedPreparedFace({
      face,
      assignedTagId,
      tag,
      candidates,
      embedding,
    }))
  }

  return prepared
}

export function assembleListedFacesForMedia(input: {
  mediaId: number
  prepared: ListedPreparedFace[]
  enrollmentRefs: Array<{tagId: number; embedding: Float32Array}>
  candidateLimit: number
  resolveTag: (tagId: number) => TagLike | null | undefined
}) {
  const clustered = clusterFacesInMedia(input.prepared)
  reRankListedClusterCandidates(
    clustered,
    input.enrollmentRefs,
    input.candidateLimit,
    input.resolveTag,
  )
  return {mediaId: input.mediaId, faces: stripEmbeddingsFromFaces(clustered)}
}
