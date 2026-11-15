import {z} from 'zod'
import type {SourceCapabilities} from './mediaSources'
import {VIDEO_CONTENT_TYPES as DRIVE_VIDEO_CONTENT_TYPES, mediaFileKind as driveMediaKind} from './mediaFormats'

export {VIDEO_CONTENT_TYPES as DRIVE_VIDEO_CONTENT_TYPES, mediaFileKind as driveMediaKind} from './mediaFormats'

// Google-issued OAuth secrets never contain whitespace; strip pasted wrapping.
export const normalizeDriveClientSecret = (value: string): string => value.replace(/\s+/g, '')

export const DriveFileIdSchema = z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/)
export const DriveImportSchema = z.object({fileId: DriveFileIdSchema}).strict()
export const DriveConfigurationSchema = z.object({
  clientId: z.string().trim().min(1).max(1024),
  clientSecret: z.string().trim().max(4096).transform(normalizeDriveClientSecret).optional(),
  // Omitted = automatic: always the API's current loopback callback (Desktop OAuth clients).
  redirectUri: z.string().url().max(2048).refine(value => {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      && url.pathname === '/api/drive/oauth/callback' && !url.search && !url.hash
  }).optional(),
}).strict()
export type DriveStatus = {hasSavedConfiguration?: boolean; automaticRedirectUri?: boolean; suggestedRedirectUri?: string; redirectUriMismatch?: boolean; capabilities?: SourceCapabilities; configured: boolean; authenticated: boolean; mock: boolean; redirectUri: string; clientId?: string; hasClientId: boolean; oauthResult?: 'waiting' | 'connected' | 'failed' | 'expired'; oauthError?: 'cancelled' | 'expired' | 'access_denied' | 'invalid_client' | 'invalid_grant' | 'redirect_uri_mismatch' | 'network_error' | 'token_storage_error' | 'unknown'}
export type DriveEntry = {id: string; name: string; mimeType: string; size?: number; modifiedTime?: string; isFolder: boolean; mediaId?: number | null}
export type DriveFolder = {folderId: string; files: DriveEntry[]; nextPageToken?: string; mock: boolean}
export type DriveImportResult = {id: number; title: string; created: boolean}

/** Drive sometimes reports a binary MIME type for uploaded video containers. */
export function driveMediaContentType(name: string, mimeType: string): string {
  const type = mimeType.trim().toLowerCase()
  if (driveMediaKind(name) === 'video' && [
    '', 'application/octet-stream', 'binary/octet-stream', 'application/x-matroska',
    'application/x-ms-asf', 'application/vnd.ms-asf', 'application/vnd.rn-realmedia',
    'application/vnd.rn-realmedia-vbr', 'application/mxf', 'application/ogg',
  ].includes(type)) return DRIVE_VIDEO_CONTENT_TYPES[name.split('.').pop()!.toLowerCase()]
  return type
}
export const driveMediaPath = (fileId: string) => `gdrive://${DriveFileIdSchema.parse(fileId)}`
export function parseDriveMediaPath(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('gdrive://')) return null
  const parsed = DriveFileIdSchema.safeParse(value.slice(9))
  return parsed.success ? parsed.data : null
}
export const isDriveMediaPath = (value: unknown): boolean => parseDriveMediaPath(value) !== null
export function driveFileViewUrl(value: unknown): string | null {
  const fileId = parseDriveMediaPath(value)
  return fileId ? `https://drive.google.com/file/d/${fileId}/view` : null
}
