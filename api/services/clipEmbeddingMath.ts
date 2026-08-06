export type ClipEmbeddingVector = number[]

export type ClipEmbeddingCandidate = {
  id: number
  embeddings: ClipEmbeddingVector[]
}

export function l2Normalize(values: ClipEmbeddingVector): ClipEmbeddingVector {
  if (!values.length) return []
  let sum = 0
  for (const value of values) sum += value * value
  const norm = Math.sqrt(sum)
  if (!norm) return values.map(() => 0)
  return values.map((value) => value / norm)
}

export function packFloat32Embedding(values: ClipEmbeddingVector): Buffer {
  return packFloat32Embeddings([values])
}

/** Concatenate one or more unit vectors into a single blob (row-major). */
export function packFloat32Embeddings(vectors: ClipEmbeddingVector[]): Buffer {
  if (!vectors.length) return Buffer.alloc(0)
  const dims = vectors[0].length
  if (!dims || vectors.some((vector) => vector.length !== dims)) {
    throw new Error('CLIP embedding pack requires equal non-empty dims')
  }
  const buffer = Buffer.allocUnsafe(vectors.length * dims * 4)
  let offset = 0
  for (const values of vectors) {
    for (let i = 0; i < dims; i++) {
      buffer.writeFloatLE(values[i], offset)
      offset += 4
    }
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

/**
 * Split a packed blob into per-tile vectors using the stored per-vector `dims`.
 * Legacy single-vector rows (byteLength/4 === dims) return one embedding.
 */
export function unpackFloat32Embeddings(
  buffer: Buffer | Uint8Array | null | undefined,
  dims: number,
): ClipEmbeddingVector[] {
  const flat = unpackFloat32Embedding(buffer)
  if (!flat.length) return []
  const perVector = Math.floor(Number(dims))
  if (!Number.isFinite(perVector) || perVector <= 0 || flat.length % perVector !== 0) {
    return [flat]
  }
  const tiles: ClipEmbeddingVector[] = []
  for (let offset = 0; offset < flat.length; offset += perVector) {
    tiles.push(flat.slice(offset, offset + perVector))
  }
  return tiles
}

export function cosineSimilarity(a: ClipEmbeddingVector, b: ClipEmbeddingVector): number {
  if (!a.length || !b.length || a.length !== b.length) return 0
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  return dot
}

/** Best cosine between a query vector and any candidate tile. */
export function maxCosineSimilarity(
  query: ClipEmbeddingVector,
  embeddings: ClipEmbeddingVector[],
): number {
  if (!query.length || !embeddings.length) return 0
  let best = -Infinity
  for (const embedding of embeddings) {
    const score = cosineSimilarity(query, embedding)
    if (score > best) best = score
  }
  return Number.isFinite(best) ? best : 0
}

/** Best cosine across any seed tile × any candidate tile (scene-level similar). */
export function maxPairwiseCosineSimilarity(
  seed: ClipEmbeddingVector[],
  candidate: ClipEmbeddingVector[],
): number {
  if (!seed.length || !candidate.length) return 0
  let best = -Infinity
  for (const seedEmbedding of seed) {
    for (const candidateEmbedding of candidate) {
      const score = cosineSimilarity(seedEmbedding, candidateEmbedding)
      if (score > best) best = score
    }
  }
  return Number.isFinite(best) ? best : 0
}

export function rankByCosineSimilarity(
  query: ClipEmbeddingVector,
  candidates: Array<{id: number; embedding: ClipEmbeddingVector}>,
  limit: number,
): number[] {
  return rankByMaxCosineSimilarity(
    query,
    candidates.map((candidate) => ({
      id: candidate.id,
      embeddings: [candidate.embedding],
    })),
    limit,
  )
}

/** Rank media by the best matching tile (max-pooled CLIP score). */
export function rankByMaxCosineSimilarity(
  query: ClipEmbeddingVector,
  candidates: ClipEmbeddingCandidate[],
  limit: number,
): number[] {
  if (!query.length || limit <= 0) return []
  const scored = candidates
    .map((candidate) => ({
      id: candidate.id,
      score: maxCosineSimilarity(query, candidate.embeddings),
    }))
    .filter((row) => Number.isFinite(row.score))
    .sort((a, b) => b.score - a.score || a.id - b.id)

  return scored.slice(0, limit).map((row) => row.id)
}

export function rankByMaxPairwiseCosineSimilarity(
  seed: ClipEmbeddingVector[],
  candidates: ClipEmbeddingCandidate[],
  limit: number,
): number[] {
  if (!seed.length || limit <= 0) return []
  const scored = candidates
    .map((candidate) => ({
      id: candidate.id,
      score: maxPairwiseCosineSimilarity(seed, candidate.embeddings),
    }))
    .filter((row) => Number.isFinite(row.score))
    .sort((a, b) => b.score - a.score || a.id - b.id)

  return scored.slice(0, limit).map((row) => row.id)
}

/** Inclusive crop boxes [x0, y0, x1, y1] for a contact-sheet grid (row-major). */
export function getGridTileCropBoxes(
  width: number,
  height: number,
  cols: number,
  rows: number,
): Array<[number, number, number, number]> {
  const w = Math.floor(Number(width))
  const h = Math.floor(Number(height))
  const c = Math.floor(Number(cols))
  const r = Math.floor(Number(rows))
  if (w <= 0 || h <= 0 || c <= 0 || r <= 0) return []

  const tileW = Math.floor(w / c)
  const tileH = Math.floor(h / r)
  if (tileW <= 0 || tileH <= 0) return []

  const boxes: Array<[number, number, number, number]> = []
  for (let row = 0; row < r; row++) {
    for (let col = 0; col < c; col++) {
      const x0 = col * tileW
      const y0 = row * tileH
      const x1 = col === c - 1 ? w - 1 : x0 + tileW - 1
      const y1 = row === r - 1 ? h - 1 : y0 + tileH - 1
      boxes.push([x0, y0, x1, y1])
    }
  }
  return boxes
}
