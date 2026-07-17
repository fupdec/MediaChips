/** Keep bulk inserts small enough to avoid Drizzle's `params.push(...query.params)` stack overflow. */
export const BULK_INSERT_CHUNK_SIZE = 200

export function chunkArray<T>(items: T[], size: number = BULK_INSERT_CHUNK_SIZE): T[][] {
  if (!items.length) return []
  if (items.length <= size) return [items]

  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

export function forEachChunk<T>(
  items: T[],
  iteratee: (chunk: T[]) => void,
  size: number = BULK_INSERT_CHUNK_SIZE,
): void {
  for (const chunk of chunkArray(items, size)) {
    iteratee(chunk)
  }
}

export function mapChunks<T, R>(
  items: T[],
  iteratee: (chunk: T[]) => R[],
  size: number = BULK_INSERT_CHUNK_SIZE,
): R[] {
  const result: R[] = []
  for (const chunk of chunkArray(items, size)) {
    result.push(...iteratee(chunk))
  }
  return result
}
