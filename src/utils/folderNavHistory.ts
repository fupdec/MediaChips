export type FolderNavHistory = {
  entries: (string | null)[]
  index: number
}

export function emptyFolderNavHistory(): FolderNavHistory {
  return {entries: [], index: -1}
}

export function seedFolderNavHistory(path: string | null): FolderNavHistory {
  return {entries: [path], index: 0}
}

export function canGoFolderHistoryBack(history: FolderNavHistory): boolean {
  return history.index > 0
}

export function canGoFolderHistoryForward(history: FolderNavHistory): boolean {
  return history.index >= 0 && history.index < history.entries.length - 1
}

export function canGoFolderUp(options: {
  parentPath?: string | null
  fsParentPath?: string | null
  hasFsRoot?: boolean
}): boolean {
  if (options.hasFsRoot) return Boolean(options.fsParentPath)
  return Boolean(options.parentPath || options.fsParentPath)
}

export function recordFolderNavPath(
  history: FolderNavHistory,
  path: string | null,
): FolderNavHistory {
  if (history.index >= 0 && history.entries[history.index] === path) return history
  const entries = history.entries.slice(0, history.index + 1)
  entries.push(path)
  return {entries, index: entries.length - 1}
}

export function stepFolderNavHistory(
  history: FolderNavHistory,
  direction: -1 | 1,
): {history: FolderNavHistory; path: string | null} | null {
  const nextIndex = history.index + direction
  if (nextIndex < 0 || nextIndex >= history.entries.length) return null
  return {
    history: {...history, index: nextIndex},
    path: history.entries[nextIndex] ?? null,
  }
}
