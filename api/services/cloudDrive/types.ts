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
  listFolder(folderId: string, pageToken?: string): Promise<DriveListResult>
  getFileMeta(fileId: string): Promise<DriveFileMeta>
  downloadFile(fileId: string, rangeHeader?: string): Promise<DriveHttpResponse>
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
