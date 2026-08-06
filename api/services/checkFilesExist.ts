import { normalizeMediaPath } from '../utils/normalizeUserPath'
import { resolveExistingPath } from './contentHash'
import { isVirtualZipPath, zipEntryExists } from './zipGallery'
import { mapWithConcurrency } from './thumbEncoding'

const MAX_BATCH_SIZE = 100
/** Cap parallel FS checks so grid scroll cannot flood the disk/event loop. */
export const CHECK_FILES_EXIST_CONCURRENCY = 16

export async function checkFilesExist(paths: string[]): Promise<Record<string, boolean>> {
  const uniquePaths = [...new Set(
    paths
      .filter((path): path is string => typeof path === 'string' && path.length > 0)
      .slice(0, MAX_BATCH_SIZE),
  )]

  const results: Record<string, boolean> = {}

  await mapWithConcurrency(uniquePaths, CHECK_FILES_EXIST_CONCURRENCY, async (path) => {
    const normalized = normalizeMediaPath(path)
    if (isVirtualZipPath(normalized)) {
      results[path] = await zipEntryExists(normalized)
      return
    }
    const resolved = normalized ? await resolveExistingPath(normalized) : null
    results[path] = Boolean(resolved)
  })

  return results
}

export { MAX_BATCH_SIZE }
