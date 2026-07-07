import type { ChokidarOptions } from 'chokidar'

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

export function buildChokidarOptions(folderPaths: string[]): ChokidarOptions {
  const usePolling = needsPollingForFolders(folderPaths)

  return {
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: usePolling ? 1500 : 1000,
      pollInterval: 100,
    },
    ignored: /(^|[\/\\])\../,
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
