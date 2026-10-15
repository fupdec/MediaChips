/** Finish and account for the active request before honoring Stop. Unknown
 * outcomes stay selected for an explicit, idempotent retry; never retry writes
 * automatically after a timeout. Both Drive and NAS use this queue. */
export async function runRemoteImportQueue<T extends {path: string}>(options: {
  paths: string[]
  shouldStop: () => boolean
  nextChunkSize: () => Promise<number>
  request: (paths: string[]) => Promise<T[]>
  onResults: (results: T[]) => Promise<void> | void
  onRequestError?: (paths: string[], error: unknown) => Promise<void> | void
  onProgress?: (processed: number, total: number) => void
}) {
  const paths = [...new Set(options.paths)]
  let processed = 0
  while (processed < paths.length && !options.shouldStop()) {
    const capacity = await options.nextChunkSize()
    const size = Number.isFinite(capacity) ? Math.min(20, Math.max(0, Math.floor(capacity))) : 0
    if (options.shouldStop() || !size) break
    const chunk = paths.slice(processed, processed + size)
    let results: T[] | undefined
    try {
      results = await options.request(chunk)
      if (!Array.isArray(results) || results.length !== chunk.length || results.some((result, index) => result?.path !== chunk[index])) {
        throw new Error('Source returned an incomplete import result. Retry the remaining files.')
      }
    } catch (error) {
      if (!options.onRequestError) throw error
      await options.onRequestError(chunk, error)
      results = undefined
    }
    if (results) await options.onResults(results)
    processed += chunk.length
    options.onProgress?.(processed, paths.length)
  }
  return {processed, total: paths.length, stopped: processed < paths.length}
}
