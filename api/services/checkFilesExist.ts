import { normalizeMediaPath } from '../utils/normalizeUserPath'
import { resolveExistingPath } from './contentHash'
import { isVirtualZipPath, zipEntryExists } from './zipGallery'

const MAX_BATCH_SIZE = 100

export async function checkFilesExist(paths: string[]): Promise<Record<string, boolean>> {
  const uniquePaths = [...new Set(
    paths
      .filter((path): path is string => typeof path === 'string' && path.length > 0)
      .slice(0, MAX_BATCH_SIZE),
  )]

  const results: Record<string, boolean> = {}

  await Promise.all(uniquePaths.map(async (path) => {
    const normalized = normalizeMediaPath(path)
    if (isVirtualZipPath(normalized)) {
      results[path] = await zipEntryExists(normalized)
      return
    }
    const resolved = normalized ? await resolveExistingPath(normalized) : null
    results[path] = Boolean(resolved)
  }))

  return results
}

export { MAX_BATCH_SIZE }
