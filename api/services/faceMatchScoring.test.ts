import {describe, expect, it} from 'vitest'
import {
  MATCH_SCORE_MARGIN,
  clampCandidateLimit,
  cosineSimilarity,
  embeddingFromJson,
  embeddingToJson,
  findTopEnrollmentMatches,
  findTopEnrollmentMatchesForEmbeddings,
  l2Normalize,
  pickMatchFromCandidates,
  scoreEnrollmentTags,
} from './faceMatchScoring'

function vec(...values: number[]) {
  return l2Normalize(values)
}

describe('faceMatchScoring', () => {
  it('clamps candidate limits into the supported range', () => {
    expect(clampCandidateLimit(undefined)).toBe(10)
    expect(clampCandidateLimit(1)).toBe(3)
    expect(clampCandidateLimit(100)).toBe(20)
    expect(clampCandidateLimit('7')).toBe(7)
  })

  it('round-trips embeddings through JSON', () => {
    const embedding = vec(1, 0, 0, 0)
    const restored = embeddingFromJson(embeddingToJson(embedding))
    expect(Array.from(restored.slice(0, 4))).toEqual(Array.from(embedding.slice(0, 4)))
  })

  it('scores enrollments with top-2 blending per tag', () => {
    const query = vec(1, 0)
    const enrollments = [
      {tagId: 1, embedding: vec(1, 0)},
      {tagId: 1, embedding: vec(0.8, 0.2)},
      {tagId: 2, embedding: vec(0, 1)},
    ]
    const scores = scoreEnrollmentTags(query, enrollments)
    const tag1 = scores.get(1)!
    const single = cosineSimilarity(query, vec(1, 0))
    const second = cosineSimilarity(query, vec(0.8, 0.2))
    expect(tag1).toBeCloseTo(single * 0.7 + second * 0.3, 5)
    expect(scores.get(2)).toBeCloseTo(cosineSimilarity(query, vec(0, 1)), 5)
  })

  it('ranks enrollment matches by score', () => {
    const query = vec(1, 0)
    const top = findTopEnrollmentMatches(query, [
      {tagId: 2, embedding: vec(0, 1)},
      {tagId: 1, embedding: vec(1, 0)},
    ], 2)
    expect(top.map((item) => item.tagId)).toEqual([1, 2])
  })

  it('rejects matches below confidence or with a thin margin', () => {
    expect(pickMatchFromCandidates([{tagId: 1, score: 0.4}], 0.55)).toEqual({
      accepted: false,
      best: {tagId: 1, score: 0.4},
      ambiguous: false,
    })

    expect(pickMatchFromCandidates([
      {tagId: 1, score: 0.7},
      {tagId: 2, score: 0.7 - (MATCH_SCORE_MARGIN / 2)},
    ], 0.55)).toMatchObject({
      accepted: false,
      ambiguous: true,
    })

    expect(pickMatchFromCandidates([
      {tagId: 1, score: 0.8},
      {tagId: 2, score: 0.6},
    ], 0.55)).toMatchObject({
      accepted: true,
      ambiguous: false,
    })
  })

  it('uses multi-frame scores when ranking cluster embeddings', () => {
    const enrollments = [
      {tagId: 1, embedding: vec(1, 0)},
      {tagId: 2, embedding: vec(0, 1)},
    ]
    const top = findTopEnrollmentMatchesForEmbeddings([
      vec(1, 0),
      vec(0.9, 0.1),
      null,
    ], enrollments, 2)
    expect(top[0]?.tagId).toBe(1)
    expect(top[0]?.score).toBeGreaterThan(top[1]?.score ?? 0)
  })
})
