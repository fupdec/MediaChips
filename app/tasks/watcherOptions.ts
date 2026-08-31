import {normalizeMediaPath} from '../../api/utils/normalizeUserPath'
import {
  isMountedVolumePath,
  isUncPath,
  needsPollingForFolders,
  needsPollingForPath,
  stabilityThresholdMs,
} from '../../api/utils/watchPathHints'

export {
  isMountedVolumePath,
  isUncPath,
  needsPollingForFolders,
  needsPollingForPath,
  stabilityThresholdMs,
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
