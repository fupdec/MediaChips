import {apiClient} from '../apiClient'
import {API_ROUTES} from '@shared/api/routes'
import {
  parseBrowseDirectoryResult,
  parseBrowsePlacesResponse,
  parseMediaRootsResponse,
} from '@shared/schemas'
import {validated} from './validate'

export type BrowsePlace = {
  id: string
  path: string
  name: string
  icon: string
}

export type BrowsePlacesResponse = {
  places: BrowsePlace[]
  container: boolean
}

export type BrowseDirectoryEntry = {
  name: string
  path: string
  isDirectory: boolean
  size: number | null
  mtimeMs: number | null
  extension: string | null
  inLibrary: boolean
  addable: boolean
  mediaId: number | null
}

export type BrowseDirectoryResult = {
  currentPath: string
  parentPath: string | null
  rootPath: string | null
  truncated: boolean
  platform: string
  entries: BrowseDirectoryEntry[]
}

export type MediaRootEntry = {
  path: string
  name: string
  children: Array<{path: string; name: string}>
}

export const browseApi = {
  listBrowsePlaces() {
    return apiClient.get(API_ROUTES.browsePlaces, {timeout: 5000}).then((res) => {
      const data = validated(parseBrowsePlacesResponse, res.data)
      const result: BrowsePlacesResponse = {
        places: Array.isArray(data.places) ? data.places as BrowsePlace[] : [],
        container: Boolean(data.container),
      }
      return {...res, data: result}
    })
  },

  listBrowseDirectory(input: {
    path: string
    extensions?: string
    showHidden?: boolean
  }) {
    return apiClient.post(API_ROUTES.browseListDirectory, {
      path: input.path,
      extensions: input.extensions || undefined,
      showHidden: input.showHidden || undefined,
    }, {timeout: 10000}).then((res) => {
      const data = validated(parseBrowseDirectoryResult, res.data)
      const result: BrowseDirectoryResult = {
        currentPath: String(data.currentPath || input.path),
        parentPath: data.parentPath ?? null,
        rootPath: data.rootPath ?? null,
        truncated: Boolean(data.truncated),
        platform: String(data.platform || ''),
        entries: (Array.isArray(data.entries) ? data.entries : []).map((entry) => ({
          name: String(entry.name || ''),
          path: String(entry.path || ''),
          isDirectory: Boolean(entry.isDirectory),
          size: entry.size == null ? null : Number(entry.size),
          mtimeMs: entry.mtimeMs == null ? null : Number(entry.mtimeMs),
          extension: entry.extension == null ? null : String(entry.extension),
          inLibrary: Boolean(entry.inLibrary),
          addable: Boolean(entry.addable),
          mediaId: entry.mediaId == null ? null : Number(entry.mediaId),
        })),
      }
      return {...res, data: result}
    })
  },

  listMediaRoots() {
    return apiClient.get(API_ROUTES.mediaRoots, {timeout: 5000}).then((res) => {
      const data = validated(parseMediaRootsResponse, res.data)
      const roots = (Array.isArray(data.roots) ? data.roots : []) as MediaRootEntry[]
      return {...res, data: roots}
    })
  },

  deleteEntries(entries: {path: string; name: string}[]) {
    return apiClient.post<
      {deleted: string[]; failed: Array<{path: string; reason: string}>}
    >(API_ROUTES.browseDeleteEntries, {entries}, {timeout: 15000})
  },

  copyEntries(entries: {path: string; name: string}[], destination: string) {
    return apiClient.post<
      {copied: string[]; failed: Array<{path: string; reason: string}>}
    >(API_ROUTES.browseCopyEntries, {entries, destination}, {timeout: 30000})
  },

  moveEntries(entries: {path: string; name: string}[], destination: string) {
    return apiClient.post<
      {moved: string[]; failed: Array<{path: string; reason: string}>}
    >(API_ROUTES.browseMoveEntries, {entries, destination}, {timeout: 30000})
  },

  createFolder(targetPath: string) {
    return apiClient.post<{created: string}>(
      API_ROUTES.browseCreateFolder,
      {path: targetPath},
      {timeout: 10000},
    )
  },

  renameEntry(oldPath: string, newName: string) {
    return apiClient.post<{renamed: string}>(
      API_ROUTES.browseRenameEntry,
      {path: oldPath, name: newName},
      {timeout: 10000},
    )
  },
}
