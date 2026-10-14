import {apiClient} from './apiClient'
import {driveMediaKind, DriveFileIdSchema, type DriveFolder} from '@shared/cloudDrive'
import type {BrowseDirectoryInput, BrowseDirectoryResult} from './typedApi/browse'

export const driveBrowserRoot = '/Google Drive'
export function driveFileIdFromPath(path: string) {
  return path === driveBrowserRoot ? 'root' : DriveFileIdSchema.parse(path.split('/').pop())
}
export async function listDriveDirectory(input: BrowseDirectoryInput, signal?: AbortSignal): Promise<BrowseDirectoryResult> {
  const folderId = driveFileIdFromPath(input.path)
  const files: DriveFolder['files'] = []
  const seen = new Set<string>()
  let pageToken: string | undefined
  do {
    const {data} = await apiClient.get<DriveFolder>(`/api/drive/folders/${folderId}`, {params: {pageToken}, timeout: 35_000, signal})
    files.push(...data.files)
    pageToken = data.nextPageToken
    if (pageToken && seen.has(pageToken)) throw new Error('Google Drive returned a repeated page. Refresh the folder.')
    if (pageToken) seen.add(pageToken)
  } while (pageToken && files.length < 5000)
  return {
    currentPath: input.path, rootPath: driveBrowserRoot,
    parentPath: input.path === driveBrowserRoot ? null : input.path.slice(0, input.path.lastIndexOf('/')),
    truncated: Boolean(pageToken), platform: 'linux',
    entries: files.filter(file => input.showHidden || !file.name.startsWith('.')).map(file => ({
      name: file.name, path: `${input.path}/${file.id}`, isDirectory: file.isFolder,
      size: file.size ?? null, mtimeMs: file.modifiedTime ? Date.parse(file.modifiedTime) : null,
      extension: file.isFolder ? null : file.name.split('.').pop()?.toLowerCase() ?? null,
      inLibrary: file.mediaId != null, mediaId: file.mediaId ?? null,
      addable: !file.isFolder && file.mediaId == null && !!driveMediaKind(file.name) && (file.size || 0) > 0,
    })),
  }
}
