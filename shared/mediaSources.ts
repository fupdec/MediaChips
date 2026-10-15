/** Capabilities implemented by MediaChips, rather than inferred protocol permissions. */
export type SourceCapabilities = Readonly<{
  view: boolean
  seek: boolean
  download: boolean
  move: boolean
  delete: boolean
}>

export type SourceProvider = 'nas' | 'gdrive'
export type SourceAvailability = 'unknown' | 'available' | 'unavailable'

// Write operations stay disabled until an adapter implements them and checks account permissions.
export const READ_SOURCE_CAPABILITIES: SourceCapabilities = Object.freeze({
  view: true, seek: true, download: true, move: false, delete: false,
})

/** Existing gdrive:// paths belong to the single configured Drive connection. */
export const DEFAULT_DRIVE_CONNECTION_ID = 'google-drive'
export const DEFAULT_DRIVE_CREDENTIAL_REF = 'google-drive:default'
