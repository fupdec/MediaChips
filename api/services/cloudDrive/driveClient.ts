import axios from 'axios'
import type {DriveConfig, DriveFileEntry, DriveFileMeta, DriveHttpResponse, DriveListResult, DriveTransport} from './types'
import {DriveFileIdSchema} from '../../../shared/cloudDrive'
import type {DriveTokenStore} from './tokenStore'
import {getValidAccessToken} from './oauth'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const META_FIELDS = 'id,name,mimeType,size,modifiedTime,parents,md5Checksum,trashed,capabilities(canEdit,canDelete,canAddChildren)'

type DriveApiFile = {
  id: string
  name: string
  mimeType: string
  size?: string
  modifiedTime?: string
}

function toEntry(file: DriveApiFile): DriveFileEntry {
  const isFolder = file.mimeType === 'application/vnd.google-apps.folder'
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    size: file.size ? Number(file.size) : undefined,
    modifiedTime: file.modifiedTime,
    isFolder,
  }
}

/**
 * Live Google Drive API transport (API process only).
 * Downloads use alt=media + optional Range — same contract as streamVideoFile.
 */
function createGoogleDriveTransport(
  config: DriveConfig,
  store: DriveTokenStore,
): DriveTransport {
  async function authHeaders(): Promise<Record<string, string>> {
    const token = await getValidAccessToken(config, store)
    return {Authorization: `Bearer ${token}`}
  }
  const requireWrite = () => {
    if (!store.get()?.scope?.split(/\s+/).includes('https://www.googleapis.com/auth/drive')) {
      throw Object.assign(new Error('Reconnect Google Drive to authorize managing originals.'), {code: 'drive_write_authorization', status: 409})
    }
  }
  const toMeta = (data: Omit<DriveFileMeta, 'size'> & {size?: number | string}, etag?: string): DriveFileMeta => ({
    id: data.id, name: data.name, mimeType: data.mimeType, size: Number(data.size || 0), modifiedTime: data.modifiedTime,
    parents: data.parents, md5Checksum: data.md5Checksum, capabilities: data.capabilities, etag,
  })
  const transport: DriveTransport = {
    async listFolder(folderId: string, pageToken?: string, signal?: AbortSignal): Promise<DriveListResult> {
      const parent = folderId || 'root'
      const params: Record<string, string> = {
        q: `'${parent.replace(/'/g, "\\'")}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime)',
        pageSize: '100',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
      }
      if (pageToken) params.pageToken = pageToken

      const {data} = await axios.get(`${DRIVE_API}/files`, {
        params,
        headers: await authHeaders(),
        timeout: 30_000,
        signal,
      })

      const files = Array.isArray(data.files) ? data.files.map(toEntry) : []
      return {
        folderId: parent,
        files,
        nextPageToken: data.nextPageToken,
        mock: false,
      }
    },

    async getFileMeta(fileId: string, signal?: AbortSignal) {
      const {data, headers} = await axios.get(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`, {
        params: {
          fields: META_FIELDS,
          supportsAllDrives: 'true',
        },
        headers: await authHeaders(),
        timeout: 30_000,
        signal,
      })
      if (data.trashed) throw Object.assign(new Error('File is in Drive Trash.'), {status: 404})
      return toMeta(data, headers?.etag as string | undefined)
    },

    async downloadFile(fileId: string, rangeHeader?: string, signal?: AbortSignal): Promise<DriveHttpResponse> {
      const headers = await authHeaders()
      if (rangeHeader) headers.Range = rangeHeader

      const response = await axios.get(
        `${DRIVE_API}/files/${encodeURIComponent(fileId)}`,
        {
          params: {alt: 'media', supportsAllDrives: 'true'},
          headers,
          responseType: 'stream',
          timeout: 120_000,
          signal,
          // Drive returns 206 for partial content; axios should not throw.
          validateStatus: (status) => status >= 200 && status < 300,
        },
      )

      const outHeaders: Record<string, string | undefined> = {}
      for (const [key, value] of Object.entries(response.headers)) {
        outHeaders[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value
      }

      return {
        status: response.status,
        headers: outHeaders,
        body: response.data as NodeJS.ReadableStream,
      }
    },
  }
  const metadata = (id: string, signal?: AbortSignal) => transport.getFileMeta(DriveFileIdSchema.parse(id), signal)
  const requireCapability = (allowed: boolean | undefined) => {
    if (allowed !== true) throw Object.assign(new Error('The Drive account cannot change this file.'), {code: 'permission_denied', status: 403})
  }
  transport.originals = {
    async generateId(signal) {
      requireWrite()
      const {data} = await axios.get(`${DRIVE_API}/files/generateIds`, {params: {count: 1, space: 'drive', type: 'files'}, headers: await authHeaders(), signal, timeout: 30_000})
      return DriveFileIdSchema.parse(data.ids?.[0])
    },
    async create(id, parent, name, input, size, signal, contentType = 'application/octet-stream') {
      requireWrite(); DriveFileIdSchema.parse(id)
      requireCapability((await metadata(parent, signal)).capabilities?.canAddChildren)
      const body = {id, name, parents: [parent], mimeType: input ? contentType : 'application/vnd.google-apps.folder'}
      const params = {supportsAllDrives: true, fields: META_FIELDS}
      if (!input) {
        const {data, headers} = await axios.post(`${DRIVE_API}/files`, body, {params, headers: await authHeaders(), signal, timeout: 30_000})
        return toMeta(data, headers?.etag as string | undefined)
      }
      // The reserved ID is journaled before starting a resumable session. A retry
      // can discover a committed upload even when its final response was lost.
      const session = await axios.post('https://www.googleapis.com/upload/drive/v3/files', body, {
        params: {...params, uploadType: 'resumable'}, signal, timeout: 30_000,
        headers: {...await authHeaders(), 'X-Upload-Content-Type': contentType, 'X-Upload-Content-Length': String(size)},
      })
      const url = new URL(String(session.headers.location))
      if (url.origin !== 'https://www.googleapis.com' || !url.pathname.startsWith('/upload/drive/')) throw new Error('Invalid Drive upload session')
      const response = await axios.put(url.href, input, {signal, timeout: 2 * 60 * 60_000, maxBodyLength: Infinity, maxRedirects: 0,
        headers: {...await authHeaders(), 'Content-Type': contentType, 'Content-Length': String(size)}})
      return toMeta(response.data, response.headers?.etag as string | undefined)
    },
    async update(id, name, parent, etag, signal) {
      requireWrite()
      const before = await metadata(id, signal)
      requireCapability(before.capabilities?.canEdit)
      if (etag && before.etag && etag !== before.etag) throw Object.assign(new Error('Source changed'), {code: 'source_changed', status: 409})
      const params: Record<string, string | boolean> = {supportsAllDrives: true, fields: META_FIELDS}
      if (parent && !before.parents?.includes(parent)) {
        requireCapability((await metadata(parent, signal)).capabilities?.canAddChildren)
        params.addParents = parent
        if (before.parents?.length) params.removeParents = before.parents.join(',')
      }
      const {data, headers} = await axios.patch(`${DRIVE_API}/files/${encodeURIComponent(id)}`, {name}, {params, signal, timeout: 30_000,
        headers: {...await authHeaders(), ...(etag ? {'If-Match': etag} : {})}})
      return toMeta(data, headers?.etag as string | undefined)
    },
    async remove(id, etag, signal) {
      requireWrite()
      const before = await metadata(id, signal)
      requireCapability(before.capabilities?.canDelete)
      if (etag && before.etag && etag !== before.etag) throw Object.assign(new Error('Source changed'), {code: 'source_changed', status: 409})
      await axios.delete(`${DRIVE_API}/files/${encodeURIComponent(id)}`, {params: {supportsAllDrives: true}, signal, timeout: 30_000,
        headers: {...await authHeaders(), ...(etag ? {'If-Match': etag} : {})}})
    },
  }
  return transport
}

export {createGoogleDriveTransport}
