export type ClipEmbeddingVector = number[]

export function l2Normalize(values: ClipEmbeddingVector): ClipEmbeddingVector {
  if (!values.length) return []
  let sum = 0
  for (const value of values) sum += value * value
  const norm = Math.sqrt(sum)
  if (!norm) return values.map(() => 0)
  return values.map((value) => value / norm)
}

export function packFloat32Embedding(values: ClipEmbeddingVector): Buffer {
  const buffer = Buffer.allocUnsafe(values.length * 4)
  for (let i = 0; i < values.length; i++) {
    buffer.writeFloatLE(values[i], i * 4)
  }
  return buffer
}

export function unpackFloat32Embedding(buffer: Buffer | Uint8Array | null | undefined): ClipEmbeddingVector {
  if (!buffer || !buffer.byteLength) return []
  const view = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
  if (view.byteLength % 4 !== 0) return []
  const count = view.byteLength / 4
  const values = new Array<number>(count)
  for (let i = 0; i < count; i++) {
    values[i] = view.readFloatLE(i * 4)
  }
  return values
}

export function cosineSimilarity(a: ClipEmbeddingVector, b: ClipEmbeddingVector): number {
  if (!a.length || !b.length || a.length !== b.length) return 0
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  return dot
}

export function rankByCosineSimilarity(
  query: ClipEmbeddingVector,
  candidates: Array<{id: number; embedding: ClipEmbeddingVector}>,
  limit: number,
): number[] {
  if (!query.length || limit <= 0) return []
  const scored = candidates
    .map((candidate) => ({
      id: candidate.id,
      score: cosineSimilarity(query, candidate.embedding),
    }))
    .filter((row) => Number.isFinite(row.score))
    .sort((a, b) => b.score - a.score || a.id - b.id)

  return scored.slice(0, limit).map((row) => row.id)
}
