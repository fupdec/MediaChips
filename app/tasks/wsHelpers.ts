import path from 'path'
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
      types: (folder.types || []).map((type) => ({
        id: type.id,
        extensions: type.extensions,
      })),
    })),
  )
}

export function buildWatcherMasks(extensions: WatcherExtensionsMap): string[] {
  const masks: string[] = []

  for (const folder in extensions) {
    for (const ext of extensions[folder]) {
      masks.push(path.join(folder, '**', `*.${ext}`))
    }
  }

  return masks
}

export function buildWatcherWatchPaths(
  extensions: WatcherExtensionsMap,
  useFolderRoots = false,
): string[] {
  if (useFolderRoots) {
    return Object.keys(extensions)
  }

  return buildWatcherMasks(extensions)
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
