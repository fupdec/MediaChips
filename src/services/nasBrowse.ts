import {mediaFileKind} from '@shared/mediaFormats'
import type {NasConnection, NasDirectoryResult} from '@shared/nas'
import type {BrowseDirectoryInput, BrowseDirectoryResult} from '@/services/typedApi/browse'
import {apiClient} from '@/services/apiClient'
import {collectRemoteDirectoryPages} from './remoteDirectoryPages'

export const nasBrowserRoot = (root: string) => root.replace(/\/+$/, '') || '/'
export function nasBrowserPath(root: string, relative: string) {
  const base = nasBrowserRoot(root)
  return relative ? `${base === '/' ? '' : base}/${relative}` : base
}
export function nasRelativePath(root: string, absolute: string) {
  const base = nasBrowserRoot(root)
  if (absolute === base) return ''
  const prefix = base === '/' ? '/' : `${base}/`
  if (!absolute.startsWith(prefix)) throw new Error('Path is outside the NAS root')
  const relative = absolute.slice(prefix.length)
  if (relative.includes('\\') || relative.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('Invalid NAS path')
  }
  return relative
}

export async function listNasDirectory(connection: NasConnection, input: BrowseDirectoryInput, signal?: AbortSignal, maxEntries = 5000): Promise<BrowseDirectoryResult> {
  const {entries, truncated} = await collectRemoteDirectoryPages({signal, maxEntries,
    load: async pageToken => {
      const {data} = await apiClient.get<NasDirectoryResult>(`/api/nas/connections/${connection.id}/files`, {
        params: {path: nasRelativePath(connection.root, input.path), ...(pageToken ? {pageToken} : {})}, timeout: 35_000, signal,
      })
      return data
    },
  })
  const relative = nasRelativePath(connection.root, input.path)
  const currentPath = nasBrowserPath(connection.root, relative)
  return {
    currentPath,
    rootPath: nasBrowserRoot(connection.root),
    parentPath: relative ? nasBrowserPath(connection.root, relative.split('/').slice(0, -1).join('/')) : null,
    truncated,
    platform: 'linux',
    entries: entries.filter(entry => input.showHidden || !entry.name.startsWith('.')).map(entry => ({
      name: entry.name, path: nasBrowserPath(connection.root, entry.path), isDirectory: entry.isDirectory,
      size: entry.isDirectory ? null : entry.size, mtimeMs: entry.modifiedAt ?? null,
      extension: entry.isDirectory ? null : entry.name.match(/\.([^.]+)$/)?.[1]?.toLowerCase() ?? null,
      inLibrary: entry.mediaId != null, mediaId: entry.mediaId ?? null,
      addable: !entry.isDirectory && entry.mediaId == null && !!mediaFileKind(entry.name) && entry.size > 0,
    })),
  }
}

export {expandRemoteSelection as expandNasSelection} from './remoteImportSelection'
