import type {NasImportResult} from '@shared/nas'

/** A small batch shares a NAS connection. Finish it before honoring Stop so
 * the UI can accurately retain successes and offer failed/unprocessed files again. */
export async function runNasImportQueue(options: {
  paths: string[]
  shouldStop: () => boolean
  nextChunkSize: () => Promise<number>
  request: (paths: string[]) => Promise<NasImportResult[]>
  onResults: (results: NasImportResult[]) => Promise<void> | void
}) {
  const paths = [...new Set(options.paths)]
  let processed = 0
  while (processed < paths.length && !options.shouldStop()) {
    const size = Math.min(20, Math.max(0, Math.floor(await options.nextChunkSize())))
    if (options.shouldStop() || !size) break
    const chunk = paths.slice(processed, processed + size)
    const results = await options.request(chunk)
    // Unknown outcomes must remain retryable; repeating an import is idempotent.
    if (results.length !== chunk.length || results.some((result, index) => result.path !== chunk[index])) {
      throw new Error('NAS returned an incomplete import result. Retry the remaining files.')
    }
    await options.onResults(results)
    processed += chunk.length
  }
  return {processed, total: paths.length, stopped: processed < paths.length}
}
