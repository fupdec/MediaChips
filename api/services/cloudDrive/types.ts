export type DriveOAuthTokens = {
  accessToken: string
  refreshToken?: string
  expiryDate?: number
  tokenType?: string
  scope?: string
}

export type DriveMediaMetadata = {
  videoMediaMetadata?: {durationMillis?: string | number; width?: number; height?: number}
  imageMediaMetadata?: {width?: number; height?: number}
}

export type DriveFileEntry = DriveMediaMetadata & {
  id: string
  name: string
  mimeType: string
  size?: number
  modifiedTime?: string
  isFolder: boolean
}

export type DriveFileMeta = DriveMediaMetadata & {
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
  create(id: string, parent: string, name: string, input?: import('stream').Readable, size?: number, signal?: AbortSignal, contentType?: string,
    recovery?: {session?: string; save: (session: string | undefined, bytes: number) => void; open: (offset: number) => import('stream').Readable}): Promise<DriveFileMeta>
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
  thumbnail?(fileId: string, signal?: AbortSignal): Promise<Buffer | null>
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
