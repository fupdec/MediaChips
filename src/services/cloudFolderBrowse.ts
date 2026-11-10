import {apiClient} from './apiClient'
import {collectRemoteDirectoryPages} from './remoteDirectoryPages'
import type {BrowseDirectoryInput, BrowseDirectoryResult} from './typedApi/browse'

export async function listCloudFolders(
  accountId: string, rootPath: string, {path, showHidden}: BrowseDirectoryInput,
): Promise<BrowseDirectoryResult> {
  const accountBase = `/api/cloud-accounts/${accountId}`
  if (path !== rootPath && !path.startsWith(`${rootPath}/`)) throw new Error('Folder belongs to a different cloud account')
  const parentPath = path === rootPath ? null : path.slice(0, path.lastIndexOf('/'))
  const key = parentPath === null ? 'root' : decodeURIComponent(path.slice(path.lastIndexOf('/') + 1))
  const {entries: children, truncated} = await collectRemoteDirectoryPages({
    load: async pageToken => {
      const {data} = await apiClient.get<{entries: Array<{resourceKey: string; name: string; isDirectory: boolean}>; nextPageToken?: string}>(`${accountBase}/files`, {params: {key, pageToken}})
      return data
    },
  })
  const folders = children.filter(entry => entry.isDirectory && (showHidden || !entry.name.startsWith('.'))).map(entry => ({
    path: `${path}/${encodeURIComponent(entry.resourceKey)}`,
    name: entry.name,
    isDirectory: true,
    size: null,
    mtimeMs: null,
    extension: null,
    inLibrary: false,
    mediaId: null,
    addable: false,
  }))
  return {currentPath: path, rootPath, parentPath, entries: folders, truncated, platform: 'linux'}
}
