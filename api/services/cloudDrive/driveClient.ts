import axios from 'axios'
import type {DriveConfig, DriveFileEntry, DriveHttpResponse, DriveListResult, DriveTransport} from './types'
import type {DriveTokenStore} from './tokenStore'
import {getValidAccessToken} from './oauth'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'

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

  return {
    async listFolder(folderId: string, pageToken?: string): Promise<DriveListResult> {
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
      })

      const files = Array.isArray(data.files) ? data.files.map(toEntry) : []
      return {
        folderId: parent,
        files,
        nextPageToken: data.nextPageToken,
        mock: false,
      }
    },

    async getFileMeta(fileId: string) {
      const {data} = await axios.get(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`, {
        params: {
          fields: 'id, name, mimeType, size, modifiedTime',
          supportsAllDrives: 'true',
        },
        headers: await authHeaders(),
        timeout: 30_000,
      })
      return {
        id: data.id as string,
        name: data.name as string,
        mimeType: data.mimeType as string,
        size: data.size ? Number(data.size) : 0,
        modifiedTime: data.modifiedTime as string | undefined,
      }
    },

    async downloadFile(fileId: string, rangeHeader?: string): Promise<DriveHttpResponse> {
      const headers = await authHeaders()
      if (rangeHeader) headers.Range = rangeHeader

      const response = await axios.get(
        `${DRIVE_API}/files/${encodeURIComponent(fileId)}`,
        {
          params: {alt: 'media', supportsAllDrives: 'true'},
          headers,
          responseType: 'stream',
          timeout: 120_000,
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
}

export {createGoogleDriveTransport}
