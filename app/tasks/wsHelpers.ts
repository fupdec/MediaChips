import type {
  MoveFilesWsMessage,
  WatchedFolderEntry,
  WatcherExtensionsMap,
} from '../types/websockets'
import type { MoveItemInput } from '../types/moveFile'

export function getWatcherFoldersConfigKey(folders: WatchedFolderEntry[]): string {
  return JSON.stringify(
    folders.map((folder) => ({
      path: folder.path,
      icon: folder.icon || null,
      excludedPaths: [...(folder.excludedPaths || [])].sort(),
      types: (folder.types || []).map((type) => ({
        id: type.id,
        extensions: type.extensions,
      })),
    })),
  )
}

/**
 * Watch roots for @parcel/watcher (and formerly chokidar ≥4): folder paths only.
 * Globs are not supported by the native watcher — extension filtering happens
 * in the parcel adapter.
 */
export function buildWatcherWatchPaths(
  extensions: WatcherExtensionsMap,
  _useFolderRoots = true,
): string[] {
  return Object.keys(extensions)
}

/** @deprecated Globs are unused; kept for any external callers during transition. */
export function buildWatcherMasks(extensions: WatcherExtensionsMap): string[] {
  return buildWatcherWatchPaths(extensions)
}

export function normalizeMoveMessageItems(msg: MoveFilesWsMessage): MoveItemInput[] {
  if (Array.isArray(msg.items) && msg.items.length) {
    return msg.items
  }

  return (msg.ids || []).map((id) => ({
    id,
    folder: String(msg.folder || ''),
  }))
}

export function foldersConfigUnchanged(
  currentKey: string,
  nextFolders: WatchedFolderEntry[],
): boolean {
  return Boolean(currentKey) && currentKey === getWatcherFoldersConfigKey(nextFolders)
}
