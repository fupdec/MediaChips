/** Pure face-match scoring helpers (no ORT / filesystem). */

export const EMBED_DIM = 512
export const DEFAULT_CANDIDATE_LIMIT = 10
export const MIN_CANDIDATE_LIMIT = 3
export const MAX_CANDIDATE_LIMIT = 20
/** Require a clear winner so near-ties do not become false positives. */
export const MATCH_SCORE_MARGIN = 0.08

export function clampCandidateLimit(value: unknown): number {
  const raw = Number(value)
  if (!Number.isFinite(raw)) return DEFAULT_CANDIDATE_LIMIT
  return Math.min(MAX_CANDIDATE_LIMIT, Math.max(MIN_CANDIDATE_LIMIT, Math.round(raw)))
}

export function l2Normalize(values: Float32Array | number[]) {
  let sum = 0
  for (let i = 0; i < values.length; i++) sum += values[i] * values[i]
  const norm = Math.sqrt(sum) || 1
  const out = new Float32Array(values.length)
  for (let i = 0; i < values.length; i++) out[i] = values[i] / norm
  return out
}

export function cosineSimilarity(a: Float32Array, b: Float32Array) {
  const len = Math.min(a.length, b.length)
  let sum = 0
  for (let i = 0; i < len; i++) sum += a[i] * b[i]
  return sum
}

export function embeddingToJson(embedding: Float32Array) {
  return JSON.stringify(Array.from(embedding))
}

export function embeddingFromJson(value: string): Float32Array {
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return new Float32Array(EMBED_DIM)
    return l2Normalize(parsed.map(Number))
  } catch {
    return new Float32Array(EMBED_DIM)
  }
}

export function averageEmbeddings(embeddings: Array<Float32Array | null | undefined>): Float32Array | null {
  const usable = embeddings.filter((item): item is Float32Array => Boolean(item && item.length))
  if (!usable.length) return null
  if (usable.length === 1) return usable[0]
  const dim = usable[0].length
  const sum = new Float32Array(dim)
  for (const embedding of usable) {
    const len = Math.min(dim, embedding.length)
    for (let i = 0; i < len; i++) sum[i] += embedding[i]
  }
  const scale = 1 / usable.length
  for (let i = 0; i < dim; i++) sum[i] *= scale
  return l2Normalize(sum)
}

export function scoreEnrollmentTags(
  embedding: Float32Array,
  enrollments: Array<{tagId: number; embedding: string | Float32Array}>,
): Map<number, number> {
  const scoresByTag = new Map<number, number[]>()

  for (const enrollment of enrollments) {
    const tagId = Number(enrollment.tagId)
    if (!Number.isFinite(tagId) || tagId <= 0) continue
    const ref = typeof enrollment.embedding === 'string'
      ? embeddingFromJson(enrollment.embedding)
      : enrollment.embedding
    if (!ref?.length) continue
    const score = cosineSimilarity(embedding, ref)
    const list = scoresByTag.get(tagId)
    if (list) list.push(score)
    else scoresByTag.set(tagId, [score])
  }

  const result = new Map<number, number>()
  for (const [tagId, scores] of scoresByTag) {
    scores.sort((a, b) => b - a)
    // Max keeps recall; when 2+ gallery shots exist, blend top-2 to cut lucky noise.
    result.set(
      tagId,
      scores.length === 1 ? scores[0] : (scores[0] * 0.7) + (scores[1] * 0.3),
    )
  }
  return result
}

export function parseEnrollmentRefs(
  enrollments: Array<{tagId: number; embedding: string}>,
): Array<{tagId: number; embedding: Float32Array}> {
  const parsed: Array<{tagId: number; embedding: Float32Array}> = []
  for (const enrollment of enrollments) {
    const tagId = Number(enrollment.tagId)
    if (!Number.isFinite(tagId) || tagId <= 0) continue
    try {
      const embedding = embeddingFromJson(String(enrollment.embedding || ''))
      if (!embedding.length) continue
      parsed.push({tagId, embedding})
    } catch {
      // Skip corrupt gallery vectors.
    }
  }
  return parsed
}

export function findTopEnrollmentMatches(
  embedding: Float32Array,
  enrollments: Array<{tagId: number; embedding: string | Float32Array}>,
  limit = DEFAULT_CANDIDATE_LIMIT,
) {
  return [...scoreEnrollmentTags(embedding, enrollments).entries()]
    .map(([tagId, score]) => ({tagId, score}))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit))
}

/**
 * Rank people using every frame in a cluster (not only the centroid).
 * Best-frame recall recovers identity when some crops are blurry/angled;
 * a short consistency blend reduces one-off false peaks.
 */
export function findTopEnrollmentMatchesForEmbeddings(
  embeddings: Array<Float32Array | null | undefined>,
  enrollments: Array<{tagId: number; embedding: string | Float32Array}>,
  limit = DEFAULT_CANDIDATE_LIMIT,
) {
  const usable = embeddings.filter((item): item is Float32Array => Boolean(item && item.length))
  if (!usable.length) return []

  const frameScoresByTag = new Map<number, number[]>()
  for (const embedding of usable) {
    for (const [tagId, score] of scoreEnrollmentTags(embedding, enrollments)) {
      const list = frameScoresByTag.get(tagId) || []
      list.push(score)
      frameScoresByTag.set(tagId, list)
    }
  }

  const centroid = averageEmbeddings(usable)
  const centroidScores = centroid ? scoreEnrollmentTags(centroid, enrollments) : null

  return [...frameScoresByTag.entries()]
    .map(([tagId, scores]) => {
      scores.sort((a, b) => b - a)
      const best = scores[0]
      const topCount = Math.min(3, scores.length)
      let consistency = 0
      for (let i = 0; i < topCount; i++) consistency += scores[i]
      consistency /= topCount
      const centroidScore = centroidScores?.get(tagId) ?? 0
      // Prefer a real strong frame hit; centroid only stabilizes mid scores.
      const score = Math.max(best, centroidScore) * 0.7 + consistency * 0.3
      return {tagId, score}
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit))
}

export function pickMatchFromCandidates(
  candidates: Array<{tagId: number; score: number}>,
  minConfidence: number,
) {
  const best = candidates[0]
  if (!best || best.score < minConfidence) {
    return {accepted: false as const, best, ambiguous: false}
  }
  const second = candidates[1]
  const ambiguous = Boolean(second && (best.score - second.score) < MATCH_SCORE_MARGIN)
  return {accepted: !ambiguous, best, ambiguous}
}
