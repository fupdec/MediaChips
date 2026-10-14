import {z} from 'zod'

// Google-issued OAuth secrets never contain whitespace; strip pasted wrapping.
export const normalizeDriveClientSecret = (value: string): string => value.replace(/\s+/g, '')

export const DriveFileIdSchema = z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/)
export const DriveImportSchema = z.object({fileId: DriveFileIdSchema}).strict()
export const DriveConfigurationSchema = z.object({
  clientId: z.string().trim().min(1).max(1024),
  clientSecret: z.string().trim().max(4096).transform(normalizeDriveClientSecret).optional(),
  redirectUri: z.string().url().max(2048).refine(value => {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      && url.pathname === '/api/drive/oauth/callback' && !url.search && !url.hash
  }),
}).strict()
export type DriveStatus = {configured: boolean; authenticated: boolean; mock: boolean; redirectUri: string; clientId?: string; hasClientId: boolean; oauthResult?: 'waiting' | 'connected' | 'failed' | 'expired'; oauthError?: 'cancelled' | 'expired' | 'access_denied' | 'invalid_client' | 'invalid_grant' | 'redirect_uri_mismatch' | 'network_error' | 'token_storage_error' | 'unknown'}
export type DriveEntry = {id: string; name: string; mimeType: string; size?: number; modifiedTime?: string; isFolder: boolean; mediaId?: number | null}
export type DriveFolder = {folderId: string; files: DriveEntry[]; nextPageToken?: string; mock: boolean}
export type DriveImportResult = {id: number; title: string; created: boolean}

// Recognized video containers. Playback is decided by the player, not the extension.
export const DRIVE_VIDEO_CONTENT_TYPES: Record<string, string> = {
  mp4: 'video/mp4', m4v: 'video/mp4', mp4v: 'video/mp4', webm: 'video/webm',
  mov: 'video/quicktime', qt: 'video/quicktime', mkv: 'video/x-matroska',
  avi: 'video/x-msvideo', wmv: 'video/x-ms-wmv', asf: 'video/x-ms-asf',
  mpeg: 'video/mpeg', mpg: 'video/mpeg', mpe: 'video/mpeg', m1v: 'video/mpeg', m2v: 'video/mpeg',
  ts: 'video/mp2t', mts: 'video/mp2t', m2ts: 'video/mp2t', m2t: 'video/mp2t',
  vob: 'video/mpeg', mod: 'video/mpeg', tod: 'video/mp2t',
  flv: 'video/x-flv', f4v: 'video/mp4', '3gp': 'video/3gpp', '3gpp': 'video/3gpp', '3g2': 'video/3gpp2',
  ogv: 'video/ogg', ogm: 'video/ogg', mxf: 'video/mxf', rm: 'video/vnd.rn-realvideo', rmvb: 'video/vnd.rn-realvideo',
  divx: 'video/x-msvideo',
}
export function driveMediaKind(name: string): 'video' | 'audio' | 'image' | null {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (Object.prototype.hasOwnProperty.call(DRIVE_VIDEO_CONTENT_TYPES, ext)) return 'video'
  if (['mp3', 'm4a', 'aac', 'wav', 'ogg', 'flac'].includes(ext)) return 'audio'
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp'].includes(ext)) return 'image'
  return null
}
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
