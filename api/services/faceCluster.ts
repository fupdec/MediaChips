/** Pure face-clustering helpers (no ORT / filesystem). */

import {parseFaceTimestampSeconds} from '../../shared/faceTimestamp'
import {cosineSimilarity} from './faceMatchScoring'

export {parseFaceTimestampSeconds}

/** Same-person link for different poses/lighting in one video (R50 + landmark align). */
export const FACE_CLUSTER_SIMILARITY = 0.34
/** Softer link when neither face has an assigned tag yet. */
export const FACE_CLUSTER_UNMATCHED_SIMILARITY = 0.28
/** Even softer when two unmatched faces are close in time (open-mouth / profile drift). */
export const FACE_CLUSTER_TEMPORAL_SIMILARITY = 0.22
/** Seconds between timestamps to use the temporal threshold. */
export const FACE_CLUSTER_TEMPORAL_WINDOW_SEC = 20
/** Soft gate when both faces share a gallery tag suggestion. */
export const FACE_CLUSTER_CANDIDATE_SCORE = 0.28

export function clusterFacesInMedia<T extends {
  id: number
  tagId: number | null
  matchScore: number | null
  score: number
  timestamp?: string | null
  candidates?: Array<{tagId: number; score: number}>
  embedding?: Float32Array | null
}>(items: T[]) {
  const n = items.length
  if (!n) return [] as Array<T & {
    clusterId: number
    clusterFaceIds: number[]
    clusterSize: number
    clusterRepresentative: boolean
  }>

  const parent = Array.from({length: n}, (_, index) => index)
  const find = (index: number): number => {
    let current = index
    while (parent[current] !== current) current = parent[current]
    let cursor = index
    while (parent[cursor] !== current) {
      const next = parent[cursor]
      parent[cursor] = current
      cursor = next
    }
    return current
  }
  const union = (a: number, b: number) => {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent[rootB] = rootA
  }

  const topCandidate = (item: T) => {
    const best = item.candidates?.[0]
    if (!best || !Number.isFinite(best.tagId) || best.tagId <= 0) return null
    return best
  }

  const sharesCandidate = (left: T, right: T) => {
    const leftScores = new Map<number, number>()
    for (const candidate of left.candidates || []) {
      if (!candidate?.tagId || candidate.tagId <= 0) continue
      if (candidate.score < FACE_CLUSTER_CANDIDATE_SCORE) continue
      leftScores.set(candidate.tagId, candidate.score)
    }
    if (!leftScores.size) return false
    for (const candidate of right.candidates || []) {
      if (!candidate?.tagId || candidate.tagId <= 0) continue
      if (candidate.score < FACE_CLUSTER_CANDIDATE_SCORE) continue
      if (leftScores.has(candidate.tagId)) return true
    }
    return false
  }

  const embeddingThreshold = (left: T, right: T) => {
    const leftTag = left.tagId != null && left.tagId > 0 ? left.tagId : null
    const rightTag = right.tagId != null && right.tagId > 0 ? right.tagId : null
    // Never soft-merge faces that already disagree on assigned people.
    if (leftTag && rightTag && leftTag !== rightTag) return Number.POSITIVE_INFINITY

    const bothUnmatched = !leftTag && !rightTag
    if (bothUnmatched) {
      const leftTs = parseFaceTimestampSeconds(left.timestamp)
      const rightTs = parseFaceTimestampSeconds(right.timestamp)
      if (
        leftTs != null
        && rightTs != null
        && Math.abs(leftTs - rightTs) <= FACE_CLUSTER_TEMPORAL_WINDOW_SEC
      ) {
        return FACE_CLUSTER_TEMPORAL_SIMILARITY
      }
      return FACE_CLUSTER_UNMATCHED_SIMILARITY
    }
    return FACE_CLUSTER_SIMILARITY
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const left = items[i]
      const right = items[j]
      const leftTag = left.tagId != null && left.tagId > 0 ? left.tagId : null
      const rightTag = right.tagId != null && right.tagId > 0 ? right.tagId : null

      if (leftTag && rightTag && leftTag === rightTag) {
        union(i, j)
        continue
      }

      // Conflicting assigned tags stay separate.
      if (leftTag && rightTag && leftTag !== rightTag) continue

      // Assigned tag on one side + matching suggestion on the other.
      if (leftTag) {
        const rightHit = (right.candidates || []).find((candidate) => (
          candidate.tagId === leftTag && candidate.score >= FACE_CLUSTER_CANDIDATE_SCORE
        ))
        if (rightHit) {
          union(i, j)
          continue
        }
      }
      if (rightTag) {
        const leftHit = (left.candidates || []).find((candidate) => (
          candidate.tagId === rightTag && candidate.score >= FACE_CLUSTER_CANDIDATE_SCORE
        ))
        if (leftHit) {
          union(i, j)
          continue
        }
      }

      const leftCand = topCandidate(left)
      const rightCand = topCandidate(right)
      if (
        leftCand
        && rightCand
        && leftCand.tagId === rightCand.tagId
        && leftCand.score >= FACE_CLUSTER_CANDIDATE_SCORE
        && rightCand.score >= FACE_CLUSTER_CANDIDATE_SCORE
      ) {
        union(i, j)
        continue
      }

      if (sharesCandidate(left, right)) {
        union(i, j)
        continue
      }

      if (left.embedding && right.embedding) {
        const similarity = cosineSimilarity(left.embedding, right.embedding)
        if (similarity >= embeddingThreshold(left, right)) union(i, j)
      }
    }
  }

  const groups = new Map<number, number[]>()
  for (let i = 0; i < n; i++) {
    const root = find(i)
    const list = groups.get(root) || []
    list.push(i)
    groups.set(root, list)
  }

  const quality = (item: T) => {
    const match = Number(item.matchScore)
    const detection = Number(item.score)
    return (Number.isFinite(match) ? match : 0) * 10 + (Number.isFinite(detection) ? detection : 0)
  }

  const result: Array<T & {
    clusterId: number
    clusterFaceIds: number[]
    clusterSize: number
    clusterRepresentative: boolean
  }> = []

  let clusterSeq = 1
  for (const indexes of groups.values()) {
    const clusterId = clusterSeq
    clusterSeq += 1
    const clusterFaceIds = indexes.map((index) => Number(items[index].id))
    let bestIndex = indexes[0]
    for (const index of indexes) {
      if (quality(items[index]) > quality(items[bestIndex])) bestIndex = index
    }
    for (const index of indexes) {
      result[index] = {
        ...items[index],
        clusterId,
        clusterFaceIds,
        clusterSize: clusterFaceIds.length,
        clusterRepresentative: index === bestIndex,
      }
    }
  }

  return result
}
