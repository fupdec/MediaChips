import {nasBrowserRoot, nasRelativePath} from './nasBrowse'

const STORAGE_KEY = 'mediachips.nas.browser'

interface NasBrowserPrefs {
  connectionId?: string
  folders: Record<string, string>
}

function storageKey(scope: string): string {
  return `${STORAGE_KEY}.${encodeURIComponent(scope)}`
}

export function loadNasBrowserPrefs(scope: string): NasBrowserPrefs {
  try {
    const data = JSON.parse(localStorage.getItem(storageKey(scope)) || 'null')
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {folders: {}}
    const folders = data.folders && typeof data.folders === 'object' && !Array.isArray(data.folders)
      ? Object.fromEntries(Object.entries(data.folders).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
      : {}
    return {connectionId: typeof data.connectionId === 'string' ? data.connectionId : undefined, folders}
  } catch {
    return {folders: {}}
  }
}

export function persistNasBrowserLocation(scope: string, connectionId: string, path: string): void {
  try {
    const prefs = loadNasBrowserPrefs(scope)
    localStorage.setItem(storageKey(scope), JSON.stringify({
      connectionId,
      folders: {...prefs.folders, [connectionId]: path},
    }))
  } catch {
    // Browsing remains available when storage is blocked or full.
  }
}

export function restoreNasBrowserFolder(root: string, path?: string): string {
  if (path) {
    try {
      nasRelativePath(root, path)
      return path
    } catch {
      // A changed root or invalid stored path starts at the connection root.
    }
  }
  return nasBrowserRoot(root)
}
