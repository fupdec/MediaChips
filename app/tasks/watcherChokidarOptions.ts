import type { ChokidarOptions } from 'chokidar'
import { isPathUnderExcluded } from '../../api/utils/watchedFolderExcludes'
import { normalizeMediaPath } from '../../api/utils/normalizeUserPath'

function normalizeFolderPath(folderPath: string): string {
  return String(folderPath || '').replace(/\\/g, '/')
}

export function isMountedVolumePath(folderPath: string): boolean {
  return /^\/Volumes\//i.test(normalizeFolderPath(folderPath))
}

export function needsPollingForFolders(folderPaths: string[]): boolean {
  if (process.platform !== 'darwin') {
    return false
  }

  return folderPaths.some((folderPath) => isMountedVolumePath(folderPath))
}

export function collectExcludedWatchPaths(
  folders: Array<{excludedPaths?: string[] | null}>,
): string[] {
  const unique = new Map<string, string>()
  for (const folder of folders) {
    for (const raw of folder.excludedPaths || []) {
      const normalized = normalizeMediaPath(String(raw || ''))
      if (!normalized) continue
      const key = normalized.toLowerCase()
      if (!unique.has(key)) unique.set(key, normalized)
    }
  }
  return [...unique.values()]
}

export function buildChokidarOptions(
  folderPaths: string[],
  excludedPaths: string[] = [],
): ChokidarOptions {
  const usePolling = needsPollingForFolders(folderPaths)
  const excluded = excludedPaths.map((item) => normalizeMediaPath(item)).filter(Boolean)

  return {
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: usePolling ? 1500 : 1000,
      pollInterval: 100,
    },
    ignored: (watchPath: string) => {
      if (/(^|[\/\\])\../.test(watchPath)) {
        return true
      }
      return isPathUnderExcluded(watchPath, excluded)
    },
    ignorePermissionErrors: true,
    depth: 99,
    ...(usePolling
      ? {
          usePolling: true,
          interval: 1000,
          binaryInterval: 3000,
        }
      : {}),
  }
}
