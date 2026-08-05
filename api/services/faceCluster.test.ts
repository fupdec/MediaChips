import {describe, expect, it} from 'vitest'
import {
  FACE_CLUSTER_TEMPORAL_SIMILARITY,
  FACE_CLUSTER_UNMATCHED_SIMILARITY,
  clusterFacesInMedia,
  parseFaceTimestampSeconds,
} from './faceCluster'
import {cosineSimilarity, l2Normalize} from './faceMatchScoring'

function vec(...values: number[]) {
  return l2Normalize(values)
}

function blend(a: Float32Array, b: Float32Array, weight: number) {
  const out = new Float32Array(a.length)
  for (let i = 0; i < a.length; i++) {
    out[i] = a[i] * (1 - weight) + b[i] * weight
  }
  return l2Normalize(out)
}

function embeddingWithSimilarity(base: Float32Array, target: number) {
  const other = vec(0, 1, 0, 0)
  let lo = 0
  let hi = 1
  let chosen = base
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2
    chosen = blend(base, other, mid)
    const sim = cosineSimilarity(base, chosen)
    if (sim > target) lo = mid
    else hi = mid
  }
  return chosen
}

describe('parseFaceTimestampSeconds', () => {
  it('parses HH:MM:SS timestamps', () => {
    expect(parseFaceTimestampSeconds('01:02:03')).toBe(3723)
  })

  it('parses MM:SS timestamps', () => {
    expect(parseFaceTimestampSeconds('02:30')).toBe(150)
  })

  it('parses numeric seconds', () => {
    expect(parseFaceTimestampSeconds('42.5')).toBe(42.5)
  })

  it('returns null for empty or invalid values', () => {
    expect(parseFaceTimestampSeconds(null)).toBeNull()
    expect(parseFaceTimestampSeconds('')).toBeNull()
    expect(parseFaceTimestampSeconds('bad')).toBeNull()
  })
})

describe('clusterFacesInMedia', () => {
  it('unions faces that share the same assigned tag', () => {
    const clustered = clusterFacesInMedia([
      {id: 1, tagId: 7, matchScore: 0.8, score: 0.9, embedding: vec(1, 0, 0)},
      {id: 2, tagId: 7, matchScore: 0.7, score: 0.8, embedding: vec(0, 1, 0)},
    ])
    expect(clustered[0].clusterId).toBe(clustered[1].clusterId)
    expect(clustered[0].clusterSize).toBe(2)
  })

  it('keeps conflicting assigned tags in separate clusters', () => {
    const shared = vec(1, 0, 0)
    const clustered = clusterFacesInMedia([
      {id: 1, tagId: 1, matchScore: 0.8, score: 0.9, embedding: shared},
      {id: 2, tagId: 2, matchScore: 0.8, score: 0.9, embedding: shared},
    ])
    expect(clustered[0].clusterId).not.toBe(clustered[1].clusterId)
    expect(clustered.every((face) => face.clusterSize === 1)).toBe(true)
  })

  it('soft-merges unmatched faces close in time at a lower similarity threshold', () => {
    const base = vec(1, 0, 0, 0)
    const temporalSim = embeddingWithSimilarity(base, FACE_CLUSTER_TEMPORAL_SIMILARITY + 0.01)
    const unmatchedSim = embeddingWithSimilarity(base, FACE_CLUSTER_UNMATCHED_SIMILARITY - 0.01)

    const close = clusterFacesInMedia([
      {id: 1, tagId: null, matchScore: null, score: 0.8, timestamp: '00:01:00', embedding: base},
      {id: 2, tagId: null, matchScore: null, score: 0.8, timestamp: '00:01:10', embedding: temporalSim},
    ])
    const far = clusterFacesInMedia([
      {id: 3, tagId: null, matchScore: null, score: 0.8, timestamp: '00:01:00', embedding: base},
      {id: 4, tagId: null, matchScore: null, score: 0.8, timestamp: '00:05:00', embedding: unmatchedSim},
    ])

    const temporalScore = cosineSimilarity(base, temporalSim)
    const unmatchedScore = cosineSimilarity(base, unmatchedSim)
    expect(temporalScore).toBeGreaterThanOrEqual(FACE_CLUSTER_TEMPORAL_SIMILARITY)
    expect(temporalScore).toBeLessThan(FACE_CLUSTER_UNMATCHED_SIMILARITY)
    expect(unmatchedScore).toBeGreaterThan(temporalScore)
    expect(unmatchedScore).toBeLessThan(FACE_CLUSTER_UNMATCHED_SIMILARITY)

    expect(close[0].clusterId).toBe(close[1].clusterId)
    expect(far[0].clusterId).not.toBe(far[1].clusterId)
  })
})
