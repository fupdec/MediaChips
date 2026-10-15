import type {Readable} from 'stream'
import type {SourceCapabilities, SourceProvider} from '../../../shared/mediaSources'

export type SourceObject = {
  resourceKey: string
  name: string
  size: number
  isDirectory: boolean
  modifiedAt?: number
  contentType: string
  /** Provider validator, not necessarily a content hash. Empty means not yet checked. */
  version: string
}
export type SourcePage = {entries: SourceObject[]; nextPageToken?: string}
export type SourceRead = {status: number; headers: Record<string, string | undefined>; body: Readable | Buffer}

/** Secrets and server addresses are resolved by the owner of the adapter. */
export interface SourceReadAdapter {
  readonly provider: SourceProvider
  readonly capabilities: SourceCapabilities
  list(resourceKey: string, pageToken?: string, signal?: AbortSignal): Promise<SourcePage>
  stat(resourceKey: string, signal?: AbortSignal): Promise<SourceObject>
  read(resourceKey: string, rangeHeader?: string, signal?: AbortSignal): Promise<SourceRead>
  close(): void
}

export const nasFileVersion = (file: {size: number; modifiedAt?: number}) => `${file.size}:${file.modifiedAt || 0}`
export const driveFileVersion = (file: {size?: number; modifiedTime?: string}) => `${file.size || 0}:${file.modifiedTime || ''}`
