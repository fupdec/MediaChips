import type {NasConnection, NasDirectoryResult} from '@shared/nas'
import type {BrowseDirectoryInput, BrowseDirectoryResult} from '@/services/typedApi/browse'
import {apiClient} from '@/services/apiClient'

export const isNasVideo = (name: string) => /\.(mp4|m4v|webm|mov)$/i.test(name)
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

export async function listNasDirectory(connection: NasConnection, input: BrowseDirectoryInput, signal?: AbortSignal): Promise<BrowseDirectoryResult> {
  const {data} = await apiClient.get<NasDirectoryResult>(`/api/nas/connections/${connection.id}/files`, {
    params: {path: nasRelativePath(connection.root, input.path)}, timeout: 35_000, signal,
  })
  const currentPath = nasBrowserPath(connection.root, data.path)
  return {
    currentPath,
    rootPath: nasBrowserRoot(connection.root),
    parentPath: data.path ? nasBrowserPath(connection.root, data.path.split('/').slice(0, -1).join('/')) : null,
    truncated: data.truncated,
    platform: 'linux',
    entries: data.entries.filter(entry => input.showHidden || !entry.name.startsWith('.')).map(entry => ({
      name: entry.name, path: nasBrowserPath(connection.root, entry.path), isDirectory: entry.isDirectory,
      size: entry.isDirectory ? null : entry.size, mtimeMs: entry.modifiedAt ?? null,
      extension: entry.isDirectory ? null : entry.name.match(/\.([^.]+)$/)?.[1]?.toLowerCase() ?? null,
      inLibrary: entry.mediaId != null, mediaId: entry.mediaId ?? null,
      addable: !entry.isDirectory && entry.mediaId == null && isNasVideo(entry.name) && entry.size > 0,
    })),
  }
}

/** Expand selected folders before importing so Stop during scanning keeps the
 * original selection retryable. Do not silently import a truncated folder. */
export async function expandNasSelection(options: {
  paths: string[]
  directories: ReadonlySet<string>
  load: (path: string) => Promise<BrowseDirectoryResult>
  shouldStop: () => boolean
  onFolderError: (path: string, error: unknown) => void
}) {
  const files = new Set(options.paths.filter(path => !options.directories.has(path)))
  const pending = options.paths.filter(path => options.directories.has(path))
  const visited = new Set<string>()
  const failedFolders = new Set<string>()
  while (pending.length && !options.shouldStop()) {
    const folder = pending.shift()!
    if (visited.has(folder)) continue
    visited.add(folder)
    try {
      const result = await options.load(folder)
      if (options.shouldStop()) break
      if (result.truncated) throw new Error('truncated')
      for (const entry of result.entries) {
        if (entry.isDirectory) pending.push(entry.path)
        else if (entry.addable && !entry.inLibrary) files.add(entry.path)
      }
    } catch (error) {
      if (options.shouldStop()) break
      failedFolders.add(folder)
      options.onFolderError(folder, error)
    }
  }
  return {paths: [...files], failedFolders: [...failedFolders], stopped: options.shouldStop()}
}
