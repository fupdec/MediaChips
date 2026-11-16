/** Capabilities implemented by MediaChips, rather than inferred protocol permissions. */
export type SourceCapabilities = Readonly<{
  view: boolean
  seek: boolean
  download: boolean
  move: boolean
  delete: boolean
}>

export type SourceProvider = 'nas' | 'gdrive' | 'onedrive' | 'dropbox'
export type SourceAvailability = 'unknown' | 'available' | 'unavailable'

// Read-only providers (including the current Google Drive authorization).
export const READ_SOURCE_CAPABILITIES: SourceCapabilities = Object.freeze({
  view: true, seek: true, download: true, move: false, delete: false,
})

/** NAS write requests are checked by the server against the account permissions. */
export const NAS_SOURCE_CAPABILITIES: SourceCapabilities = Object.freeze({...READ_SOURCE_CAPABILITIES, move: true, delete: true})

/** Existing gdrive:// paths belong to the single configured Drive connection. */
export const DEFAULT_DRIVE_CONNECTION_ID = 'google-drive'
export const DEFAULT_DRIVE_CREDENTIAL_REF = 'google-drive:default'
