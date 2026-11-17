import {apiClient} from './apiClient'
import {collectRemoteDirectoryPages} from './remoteDirectoryPages'
import type {BrowseDirectoryEntry, BrowseDirectoryInput, BrowseDirectoryResult} from './typedApi/browse'

type CloudListEntry = {resourceKey: string; name: string; isDirectory: boolean; size?: number | null}

export type CloudDirectoryOptions = {
  /** List files next to folders; `addable` decides which of them can be selected for import. */
  files?: {addable: (file: {name: string; size: number}, folderPath: string) => boolean}
  maxEntries?: number
}

/** Browser paths are `<root>/<encoded key>/...`; the provider key is the last encoded segment. */
export async function listCloudDirectory(
  accountId: string, rootPath: string, {path, showHidden}: BrowseDirectoryInput, options: CloudDirectoryOptions = {},
): Promise<BrowseDirectoryResult> {
  const accountBase = `/api/cloud-accounts/${accountId}`
  if (path !== rootPath && !path.startsWith(`${rootPath}/`)) throw new Error('Folder belongs to a different cloud account')
  const parentPath = path === rootPath ? null : path.slice(0, path.lastIndexOf('/'))
  const key = parentPath === null ? 'root' : decodeURIComponent(path.slice(path.lastIndexOf('/') + 1))
  const {entries: children, truncated} = await collectRemoteDirectoryPages({
    maxEntries: options.maxEntries,
    load: async pageToken => {
      const {data} = await apiClient.get<{entries: CloudListEntry[]; nextPageToken?: string}>(`${accountBase}/files`, {params: {key, pageToken}})
      return data
    },
  })
  const entries = children
    .filter(entry => (entry.isDirectory || options.files) && (showHidden || !entry.name.startsWith('.')))
    .map((entry): BrowseDirectoryEntry => {
      const entryPath = `${path}/${encodeURIComponent(entry.resourceKey)}`
      if (entry.isDirectory) {
        return {path: entryPath, name: entry.name, isDirectory: true, size: null, mtimeMs: null, extension: null, inLibrary: false, mediaId: null, addable: false}
      }
      const size = entry.size ?? 0
      return {
        path: entryPath, name: entry.name, isDirectory: false, size, mtimeMs: null,
        extension: entry.name.includes('.') ? entry.name.split('.').pop()?.toLowerCase() ?? null : null,
        inLibrary: false, mediaId: null, addable: options.files?.addable({name: entry.name, size}, path) ?? false,
      }
    })
  return {currentPath: path, rootPath, parentPath, entries, truncated, platform: 'linux'}
}

/** Folders only: used by folder pickers and copy discovery. */
export function listCloudFolders(accountId: string, rootPath: string, input: BrowseDirectoryInput): Promise<BrowseDirectoryResult> {
  return listCloudDirectory(accountId, rootPath, input)
}
