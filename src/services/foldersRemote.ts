import {apiClient} from './apiClient'
import {listCloudDirectory} from './cloudFolderBrowse'
import {driveBrowserRoot, listDriveDirectory} from './driveBrowse'
import {listNasDirectory, nasBrowserPath, nasRelativePath} from './nasBrowse'
import type {BrowseDirectoryEntry, BrowseDirectoryInput, BrowseDirectoryResult, BrowsePlace} from './typedApi/browse'
import {cloudMediaPath, parseCloudMediaPath, type CloudAccount} from '@shared/cloudAccounts'
import {driveMediaPath, parseDriveMediaPath, type DriveStatus} from '@shared/cloudDrive'
import {mediaFileKind} from '@shared/mediaFormats'
import type {NasConnection} from '@shared/nas'
import {isNasMediaPath, nasMediaPath, parseNasMediaPath} from '@shared/remoteMedia'

/**
 * The folders page browses network connections (NAS, Google Drive, cloud accounts) with the same loaders
 * as the sources panel. A connection folder is addressed as `remote://<kind>/<connection id><browser path>`,
 * where the browser path is the one that connection's loader already uses.
 */
type RemoteKind = 'nas' | 'cloud' | 'gdrive'

const PREFIX = 'remote://'
const GOOGLE_DRIVE_ID = 'google-drive'
const PATH_PATTERN = /^remote:\/\/(nas|cloud|gdrive)\/([^/]+)(\/.*)?$/

type ParsedRemotePath = {kind: RemoteKind; connectionId: string; inner: string}

const nasConnections = new Map<string, NasConnection>()
const cloudAccounts = new Map<string, CloudAccount>()
const TITLES_KEY = 'mediachips.folders.remote.titles'
const MAX_TITLES = 2000

/** Drive and cloud folders are addressed by opaque IDs: remember their names so reloads and deep links stay readable. */
function loadTitles(): Map<string, string> {
  try {
    const stored = JSON.parse(localStorage.getItem(TITLES_KEY) || '{}') as Record<string, unknown>
    return new Map(Object.entries(stored).filter((pair): pair is [string, string] => typeof pair[1] === 'string'))
  } catch {
    return new Map()
  }
}

const titles = loadTitles()

function saveTitles() {
  try {
    while (titles.size > MAX_TITLES) titles.delete(titles.keys().next().value as string)
    localStorage.setItem(TITLES_KEY, JSON.stringify(Object.fromEntries(titles)))
  } catch { /* Names are only a convenience when storage is blocked or full. */ }
}

export const isRemoteFolderPath = (path: string | null | undefined): path is string => Boolean(path?.startsWith(PREFIX))

const virtualPath = (kind: RemoteKind, connectionId: string, inner: string) => `${PREFIX}${kind}/${connectionId}${inner}`

function parseRemotePath(path: string): ParsedRemotePath | null {
  const match = PATH_PATTERN.exec(path)
  if (!match) return null
  return {kind: match[1] as RemoteKind, connectionId: match[2], inner: match[3] || ''}
}

const cloudRoot = (accountId: string) => `/cloud-folders/${encodeURIComponent(accountId)}`

/** Network connections that can be opened from the places menu. Unavailable lists are skipped, not fatal. */
export async function listRemotePlaces(driveTitle: string): Promise<BrowsePlace[]> {
  const [nas, cloud, drive] = await Promise.allSettled([
    apiClient.get<NasConnection[]>('/api/nas/connections'),
    apiClient.get<CloudAccount[]>('/api/cloud-accounts'),
    apiClient.get<DriveStatus>('/api/drive/status'),
  ])
  const places: BrowsePlace[] = []
  if (nas.status === 'fulfilled') {
    nasConnections.clear()
    for (const connection of nas.value.data) {
      nasConnections.set(connection.id, connection)
      const inner = nasBrowserPath(connection.root, '')
      places.push({id: `remote:nas:${connection.id}`, name: connection.name, icon: 'mdi-nas', path: virtualPath('nas', connection.id, inner)})
      titles.set(virtualPath('nas', connection.id, inner), connection.name)
    }
  }
  if (cloud.status === 'fulfilled') {
    cloudAccounts.clear()
    for (const account of cloud.value.data.filter(item => item.authenticated)) {
      cloudAccounts.set(account.id, account)
      const path = virtualPath('cloud', account.id, cloudRoot(account.id))
      places.push({id: `remote:cloud:${account.id}`, name: account.name, icon: 'mdi-cloud-outline', path})
      titles.set(path, account.name)
    }
  }
  if (drive.status === 'fulfilled' && drive.value.data.authenticated) {
    const path = virtualPath('gdrive', GOOGLE_DRIVE_ID, driveBrowserRoot)
    places.push({id: `remote:gdrive:${GOOGLE_DRIVE_ID}`, name: driveTitle, icon: 'mdi-google-drive', path})
    titles.set(path, driveTitle)
  }
  return places
}

async function nasConnection(id: string): Promise<NasConnection> {
  const cached = nasConnections.get(id)
  if (cached) return cached
  const {data} = await apiClient.get<NasConnection[]>('/api/nas/connections')
  nasConnections.clear()
  for (const connection of data) nasConnections.set(connection.id, connection)
  const connection = nasConnections.get(id)
  if (!connection) throw new Error('Connection not found')
  return connection
}

async function cloudAccount(id: string): Promise<CloudAccount> {
  const cached = cloudAccounts.get(id)
  if (cached) return cached
  const {data} = await apiClient.get<CloudAccount[]>('/api/cloud-accounts')
  cloudAccounts.clear()
  for (const account of data) cloudAccounts.set(account.id, account)
  const account = cloudAccounts.get(id)
  if (!account) throw new Error('Connection not found')
  return account
}

async function listInner(parsed: ParsedRemotePath, input: BrowseDirectoryInput): Promise<BrowseDirectoryResult> {
  if (parsed.kind === 'nas') return listNasDirectory(await nasConnection(parsed.connectionId), input)
  if (parsed.kind === 'cloud') {
    return listCloudDirectory(parsed.connectionId, cloudRoot(parsed.connectionId), input, {files: {addable: file => Boolean(mediaFileKind(file.name))}})
  }
  return listDriveDirectory(input)
}

const lastSegment = (path: string) => path.slice(path.lastIndexOf('/') + 1)

/** The address a library card of this file would have (`gdrive://`, `nas://`, `onedrive://`...). */
async function mediaPathOf(parsed: ParsedRemotePath, entryPath: string): Promise<string | null> {
  try {
    if (parsed.kind === 'nas') {
      const connection = await nasConnection(parsed.connectionId)
      return nasMediaPath(connection.id, nasRelativePath(connection.root, entryPath))
    }
    if (parsed.kind === 'cloud') {
      const account = await cloudAccount(parsed.connectionId)
      return cloudMediaPath(account.provider, account.id, decodeURIComponent(lastSegment(entryPath)))
    }
    return driveMediaPath(lastSegment(entryPath))
  } catch {
    return null
  }
}

export const isRemoteMediaPath = (path: string) =>
  path.startsWith('gdrive://') || isNasMediaPath(path) || parseCloudMediaPath(path) !== null

export type RemoteImportResult = {id: number; title: string; created: boolean}

/** Adds one connection file to the library through that connection's own import endpoint. */
export async function importRemoteFile(path: string): Promise<RemoteImportResult> {
  const fileId = parseDriveMediaPath(path)
  if (fileId) return (await apiClient.post<RemoteImportResult>('/api/drive/import', {fileId}, {timeout: 40_000})).data
  const nas = parseNasMediaPath(path)
  if (nas) return (await apiClient.post<RemoteImportResult>('/api/nas/import', {connectionId: nas.connectionId, path: nas.relativePath}, {timeout: 40_000})).data
  const cloud = parseCloudMediaPath(path)
  if (cloud) return (await apiClient.post<RemoteImportResult>(`/api/cloud-accounts/${cloud.connectionId}/import`, {key: cloud.resourceKey}, {timeout: 40_000})).data
  throw new Error('Unsupported network file')
}

export type RemoteDirectory = {
  currentPath: string
  parentPath: string | null
  rootPath: string | null
  truncated: boolean
  folders: BrowseDirectoryEntry[]
  /** Media files only. `path` is the address a library card would have, `mediaId` is set when already in the library. */
  files: BrowseDirectoryEntry[]
}

/** Lists one connection folder: sub-folders (browser addresses) and media files (library addresses). */
export async function listRemoteDirectory(path: string, options: {showHidden?: boolean; extensions?: string} = {}): Promise<RemoteDirectory> {
  const parsed = parseRemotePath(path)
  if (!parsed) throw new Error('Invalid network folder')
  const result = await listInner(parsed, {path: parsed.inner, showHidden: options.showHidden, extensions: options.extensions})
  const wrap = (inner: string) => virtualPath(parsed.kind, parsed.connectionId, inner)
  const folders = result.entries.filter(entry => entry.isDirectory).map(entry => {
    titles.delete(wrap(entry.path))
    titles.set(wrap(entry.path), entry.name)
    return {...entry, path: wrap(entry.path)}
  })
  saveTitles()
  const files: BrowseDirectoryEntry[] = []
  for (const entry of result.entries) {
    if (entry.isDirectory || !(entry.addable || entry.mediaId != null)) continue
    const mediaPath = await mediaPathOf(parsed, entry.path)
    if (mediaPath) files.push({...entry, path: mediaPath, inLibrary: entry.mediaId != null})
  }
  return {
    currentPath: wrap(result.currentPath),
    rootPath: result.rootPath ? wrap(result.rootPath) : null,
    parentPath: result.parentPath ? wrap(result.parentPath) : null,
    truncated: result.truncated,
    folders,
    files,
  }
}

/** Path segments from the connection root down to `current`, named by what the listings showed. */
export function remoteBreadcrumbs(current: string, root: string): Array<{name: string; path: string}> {
  const rootName = titles.get(root) || root.slice(root.lastIndexOf('/') + 1)
  const crumbs = [{name: rootName, path: root}]
  const base = root.endsWith('/') ? root : `${root}/`
  if (current === root || !current.startsWith(base)) return crumbs
  let cursor = root
  for (const segment of current.slice(base.length).split('/').filter(Boolean)) {
    cursor = `${cursor.endsWith('/') ? cursor : `${cursor}/`}${segment}`
    let fallback = segment
    try { fallback = decodeURIComponent(segment) } catch { /* keep the raw segment */ }
    crumbs.push({name: titles.get(cursor) || fallback, path: cursor})
  }
  return crumbs
}

/** Like `remoteBreadcrumbs`, but looks up unknown folder names (opaque Drive/cloud IDs) in their parent listings. */
export async function resolveRemoteBreadcrumbs(current: string, root: string): Promise<Array<{name: string; path: string}>> {
  const crumbs = remoteBreadcrumbs(current, root)
  if (parseRemotePath(root)?.kind === 'nas') return crumbs
  for (let index = 1; index < crumbs.length; index += 1) {
    if (titles.has(crumbs[index].path)) continue
    try {
      await listRemoteDirectory(crumbs[index - 1].path)
    } catch {
      break
    }
  }
  return remoteBreadcrumbs(current, root)
}
