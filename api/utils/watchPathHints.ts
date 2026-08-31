/** Shared path heuristics for watcher polling / risk limits. */

function normalizeFolderPath(folderPath: string): string {
  return String(folderPath || '').replace(/\\/g, '/')
}

export function isMountedVolumePath(folderPath: string): boolean {
  return /^\/Volumes\//i.test(normalizeFolderPath(folderPath))
}

/** Windows UNC (`\\server\share` / `//server/share`) — native watchers are unreliable. */
export function isUncPath(folderPath: string): boolean {
  const raw = String(folderPath || '')
  if (/^\\\\[^\\]+\\/.test(raw)) return true
  if (/^\/\/[^/]+\//.test(raw.replace(/\\/g, '/'))) return true
  return false
}

export function needsPollingForPath(folderPath: string): boolean {
  if (isUncPath(folderPath)) return true
  if (process.platform === 'darwin' && isMountedVolumePath(folderPath)) return true
  return false
}

export function needsPollingForFolders(folderPaths: string[]): boolean {
  return folderPaths.some((folderPath) => needsPollingForPath(folderPath))
}

export function stabilityThresholdMs(usePolling: boolean): number {
  return usePolling ? 1500 : 1000
}
