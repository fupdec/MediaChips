export type ListedFaceCandidate = {
  tagId: number
  score: number
  tagName: string | null
  tagMetaId: number | null
}

export type TagLike = {
  name?: string | null
  metaId?: number | null
}

export function mapEnrollmentCandidateWithTag(
  item: {tagId: number; score: number},
  tag: TagLike | null | undefined,
): ListedFaceCandidate {
  return {
    tagId: item.tagId,
    score: item.score,
    tagName: tag?.name ?? null,
    tagMetaId: tag?.metaId != null ? Number(tag.metaId) : null,
  }
}

export function pickPrimaryTagId(
  assignedTagId: number | null,
  candidates: Array<{tagId: number}>,
): number | null {
  return assignedTagId ?? (candidates[0]?.tagId ?? null)
}

export function stripEmbeddingsFromFaces<T extends {embedding?: unknown}>(
  faces: T[],
): Array<Omit<T, 'embedding'>> {
  return faces.map(({embedding: _embedding, ...face}) => face)
}

export function groupFacesByClusterId<T extends {clusterId: number}>(
  faces: T[],
): Map<number, T[]> {
  const byCluster = new Map<number, T[]>()
  for (const face of faces) {
    const list = byCluster.get(face.clusterId) || []
    list.push(face)
    byCluster.set(face.clusterId, list)
  }
  return byCluster
}
