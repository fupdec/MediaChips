import axios from 'axios'
import {API_ROUTES} from '@shared/api/routes'

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

export async function fetchBrowseDirectory(
  baseUrl: string,
  {
    path: directoryPath,
    extensions,
    showHidden,
  }: {
    path: string
    extensions?: string
    showHidden?: boolean
  },
): Promise<BrowseDirectoryResult> {
  const url = `${baseUrl.replace(/\/$/, '')}${API_ROUTES.browseListDirectory}`
  const {data} = await axios.post<BrowseDirectoryResult>(url, {
    path: directoryPath,
    extensions: extensions || undefined,
    showHidden: showHidden || undefined,
  }, {timeout: 10000})

  return {
    currentPath: String(data?.currentPath || directoryPath),
    parentPath: data?.parentPath ?? null,
    rootPath: data?.rootPath ?? null,
    truncated: Boolean(data?.truncated),
    platform: String(data?.platform || ''),
    entries: Array.isArray(data?.entries) ? data.entries : [],
  }
}
