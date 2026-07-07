import type { WatcherFilesEntry } from '@/types/watcher'

function normalizeWatcherPath(filePath: string): string {
  return String(filePath || '').replace(/\\/g, '/').replace(/\/+$/, '')
}

function pathMatches(left: string, right: string): boolean {
  return normalizeWatcherPath(left).toLowerCase() === normalizeWatcherPath(right).toLowerCase()
}

export function removeWatcherNewPaths(
  entries: WatcherFilesEntry[],
  resolvedPaths: string[],
): WatcherFilesEntry[] {
  if (!resolvedPaths.length || !entries.length) {
    return entries
  }

  return entries.map((entry) => ({
    ...entry,
    files: entry.files.map((group) => ({
      ...group,
      new: group.new.filter((filePath) =>
        !resolvedPaths.some((resolvedPath) => pathMatches(filePath, resolvedPath)),
      ),
    })),
  }))
}
