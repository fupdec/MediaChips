import {apiClient} from './apiClient'
import {collectRemoteDirectoryPages} from './remoteDirectoryPages'
import {driveMediaKind, DriveFileIdSchema, type DriveFolder} from '@shared/cloudDrive'
import type {BrowseDirectoryInput, BrowseDirectoryResult} from './typedApi/browse'

export const driveBrowserRoot = '/Google Drive'
export function driveFileIdFromPath(path: string) {
  return path === driveBrowserRoot ? 'root' : DriveFileIdSchema.parse(path.split('/').pop())
}

/** Resolve browser IDs to folder/file names; never feed opaque IDs to the parser. */
export function driveReadablePath(path: string, pathTitles: Record<string, string>): string {
  const parts = path.slice(driveBrowserRoot.length).split('/').filter(Boolean)
  let current = driveBrowserRoot
  return '/' + parts.flatMap(part => {
    current += `/${part}`
    return pathTitles[current] ? [pathTitles[current]] : []
  }).join('/')
}
export async function listDriveDirectory(input: BrowseDirectoryInput, signal?: AbortSignal, maxEntries = 5000): Promise<BrowseDirectoryResult> {
  const folderId = driveFileIdFromPath(input.path)
  const {entries: files, truncated} = await collectRemoteDirectoryPages({signal, maxEntries,
    load: async pageToken => {
      const {data} = await apiClient.get<DriveFolder>(`/api/drive/folders/${folderId}`, {params: {pageToken}, timeout: 35_000, signal})
      return {entries: data.files, nextPageToken: data.nextPageToken}
    },
  })
  return {
    currentPath: input.path, rootPath: driveBrowserRoot,
    parentPath: input.path === driveBrowserRoot ? null : input.path.slice(0, input.path.lastIndexOf('/')),
    truncated, platform: 'linux',
    entries: files.filter(file => input.showHidden || !file.name.startsWith('.')).map(file => ({
      name: file.name, path: `${input.path}/${file.id}`, isDirectory: file.isFolder,
      size: file.size ?? null, mtimeMs: file.modifiedTime ? Date.parse(file.modifiedTime) : null,
      extension: file.isFolder ? null : file.name.split('.').pop()?.toLowerCase() ?? null,
      inLibrary: file.mediaId != null, mediaId: file.mediaId ?? null,
      addable: !file.isFolder && file.mediaId == null && !!driveMediaKind(file.name) && (file.size || 0) > 0,
    })),
  }
}
