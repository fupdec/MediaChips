/**
 * Run async work in ordered batches with bounded concurrency.
 * Results are returned in input order; each item catches its own errors.
 */
export async function mapInOrderedBatches<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
  options: {
    shouldStop?: () => boolean
  } = {},
): Promise<Array<R | undefined>> {
  if (!items.length) return []

  const limit = Math.max(1, concurrency)
  const shouldStop = options.shouldStop || (() => false)
  const results = new Array<R | undefined>(items.length)

  for (let offset = 0; offset < items.length; offset += limit) {
    if (shouldStop()) break

    const slice = items.slice(offset, offset + limit)
    const batch = await Promise.all(slice.map(async (item, batchIndex) => {
      const index = offset + batchIndex
      try {
        return await mapper(item, index)
      } catch {
        return undefined
      }
    }))

    for (let batchIndex = 0; batchIndex < batch.length; batchIndex += 1) {
      results[offset + batchIndex] = batch[batchIndex]
    }
  }

  return results
}
