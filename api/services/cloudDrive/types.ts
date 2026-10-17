export type DriveOAuthTokens = {
  accessToken: string
  refreshToken?: string
  expiryDate?: number
  tokenType?: string
  scope?: string
}

export type DriveFileEntry = {
  id: string
  name: string
  mimeType: string
  size?: number
  modifiedTime?: string
  isFolder: boolean
}

export type DriveFileMeta = {
  id: string
  name: string
  mimeType: string
  size: number
  modifiedTime?: string
  parents?: string[]
  md5Checksum?: string
  etag?: string
  capabilities?: {canEdit?: boolean; canDelete?: boolean; canAddChildren?: boolean}
}

export type DriveOriginalTransport = {
  generateId(signal?: AbortSignal): Promise<string>
  create(id: string, parent: string, name: string, input?: import('stream').Readable, size?: number, signal?: AbortSignal, contentType?: string): Promise<DriveFileMeta>
  update(id: string, name: string, parent?: string, etag?: string, signal?: AbortSignal): Promise<DriveFileMeta>
  remove(id: string, etag?: string, signal?: AbortSignal): Promise<void>
}

export type DriveListResult = {
  folderId: string
  files: DriveFileEntry[]
  nextPageToken?: string
  mock: boolean
}

export type DriveHttpResponse = {
  status: number
  headers: Record<string, string | undefined>
  /** Body stream or buffered bytes when already loaded */
  body: NodeJS.ReadableStream | Buffer
}

export type DriveTransport = {
  originals?: DriveOriginalTransport
  listFolder(folderId: string, pageToken?: string, signal?: AbortSignal): Promise<DriveListResult>
  getFileMeta(fileId: string, signal?: AbortSignal): Promise<DriveFileMeta>
  downloadFile(fileId: string, rangeHeader?: string, signal?: AbortSignal): Promise<DriveHttpResponse>
}

export type DriveConfig = {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
  /** When true, use in-process mock transport (no Google network). */
  mock: boolean
  /** True when client id/secret are present (or mock mode). */
  configured: boolean
  tokenStorePath: string
}
