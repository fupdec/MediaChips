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
  return bestTileCosineSimilarity(query, embeddings).score
}

/** Best matching tile index + score for a query against per-tile embeddings. */
export function bestTileCosineSimilarity(
  query: ClipEmbeddingVector,
  embeddings: ClipEmbeddingVector[],
): {score: number; tileIndex: number} {
  if (!query.length || !embeddings.length) return {score: 0, tileIndex: 0}
  let best = -Infinity
  let tileIndex = 0
  for (let i = 0; i < embeddings.length; i++) {
    const score = cosineSimilarity(query, embeddings[i])
    if (score > best) {
      best = score
      tileIndex = i
    }
  }
  return {
    score: Number.isFinite(best) ? best : 0,
    tileIndex,
  }
}

/** Best cosine across any seed tile × any candidate tile (scene-level similar). */
export function bestPairwiseCosineSimilarity(
  seed: ClipEmbeddingVector[],
  candidate: ClipEmbeddingVector[],
): {score: number; seedTileIndex: number; tileIndex: number} {
  if (!seed.length || !candidate.length) {
    return {score: 0, seedTileIndex: 0, tileIndex: 0}
  }
  let best = -Infinity
  let seedTileIndex = 0
  let tileIndex = 0
  for (let i = 0; i < seed.length; i++) {
    for (let j = 0; j < candidate.length; j++) {
      const score = cosineSimilarity(seed[i], candidate[j])
      if (score > best) {
        best = score
        seedTileIndex = i
        tileIndex = j
      }
    }
  }
  return {
    score: Number.isFinite(best) ? best : 0,
    seedTileIndex,
    tileIndex,
  }
}

export function maxPairwiseCosineSimilarity(
  seed: ClipEmbeddingVector[],
  candidate: ClipEmbeddingVector[],
): number {
  return bestPairwiseCosineSimilarity(seed, candidate).score
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

export type ClipSimilarityHit = {
  id: number
  score: number
  tileIndex: number
}

/** Rank media by the best matching tile, preserving tile index. */
export function rankByMaxCosineSimilarityHits(
  query: ClipEmbeddingVector,
  candidates: ClipEmbeddingCandidate[],
  limit: number,
): ClipSimilarityHit[] {
  if (!query.length || limit <= 0) return []
  const scored = candidates
    .map((candidate) => {
      const best = bestTileCosineSimilarity(query, candidate.embeddings)
      return {
        id: candidate.id,
        score: best.score,
        tileIndex: best.tileIndex,
      }
    })
    .filter((row) => Number.isFinite(row.score))
    .sort((a, b) => b.score - a.score || a.id - b.id)

  return scored.slice(0, limit)
}

/** Rank media by the best matching tile (max-pooled CLIP score). */
export function rankByMaxCosineSimilarity(
  query: ClipEmbeddingVector,
  candidates: ClipEmbeddingCandidate[],
  limit: number,
): number[] {
  return rankByMaxCosineSimilarityHits(query, candidates, limit).map((row) => row.id)
}

export type ClipPairwiseSimilarityHit = {
  id: number
  score: number
  tileIndex: number
  tileCount: number
}

export function rankByMaxPairwiseCosineSimilarityHits(
  seed: ClipEmbeddingVector[],
  candidates: ClipEmbeddingCandidate[],
  limit: number,
): ClipPairwiseSimilarityHit[] {
  if (!seed.length || limit <= 0) return []
  return candidates
    .map((candidate) => {
      const best = bestPairwiseCosineSimilarity(seed, candidate.embeddings)
      return {
        id: candidate.id,
        score: best.score,
        tileIndex: best.tileIndex,
        tileCount: candidate.embeddings.length,
      }
    })
    .filter((row) => Number.isFinite(row.score))
    .sort((a, b) => b.score - a.score || a.id - b.id)
    .slice(0, limit)
}

export function rankByMaxPairwiseCosineSimilarity(
  seed: ClipEmbeddingVector[],
  candidates: ClipEmbeddingCandidate[],
  limit: number,
): number[] {
  return rankByMaxPairwiseCosineSimilarityHits(seed, candidates, limit).map((row) => row.id)
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
