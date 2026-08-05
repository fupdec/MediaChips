import { parseStoredFaceEmbedding } from './faceListMatchEnrich'

/**
 * Prefer a stored embedding JSON; otherwise embed from the absolute crop path.
 * I/O stays injected so this stays unit-testable without ONNX.
 */
export async function resolveFaceEmbedding(input: {
  embedding?: string | null
  cropPath?: string | null
  resolveCropPath: (cropPath: string | null | undefined) => string | null
  embedFromPath: (path: string) => Promise<Float32Array>
}): Promise<Float32Array | null> {
  const stored = parseStoredFaceEmbedding(input.embedding)
  if (stored) return stored

  const cropPath = input.resolveCropPath(input.cropPath)
  if (!cropPath) return null

  try {
    return await input.embedFromPath(cropPath)
  } catch {
    return null
  }
}
