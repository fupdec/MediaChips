import type {CloudMediaMetadata} from '../cloudAccounts/mediaMetadata'
import type {Readable} from 'stream'
import type {SourceCapabilities, SourceProvider} from '../../../shared/mediaSources'

export type SourceObject = {
  resourceKey: string
  name: string
  size: number
  isDirectory: boolean
  modifiedAt?: number
  etag?: string
  contentType: string
  mediaMetadata?: CloudMediaMetadata
  /** Provider validator, not necessarily a content hash. Empty means not yet checked. */
  version: string
}
export type SourcePage = {entries: SourceObject[]; nextPageToken?: string}
export type SourceRead = {status: number; headers: Record<string, string | undefined>; body: Readable | Buffer}

/** Secrets and server addresses are resolved by the owner of the adapter. */
export interface SourceReadAdapter {
  readonly provider: SourceProvider | 'local'
  readonly capabilities: SourceCapabilities
  list(resourceKey: string, pageToken?: string, signal?: AbortSignal): Promise<SourcePage>
  stat(resourceKey: string, signal?: AbortSignal): Promise<SourceObject>
  read(resourceKey: string, rangeHeader?: string, signal?: AbortSignal): Promise<SourceRead>
  /** Provider-supplied cover; never downloads the video original. */
  thumbnail?(resourceKey: string, signal?: AbortSignal): Promise<Buffer | null>
  close(): void
}

/** Writes are optional: a read-only connection never advertises these operations. */
export interface SourceWriteAdapter extends SourceReadAdapter {
  drive?: import('../cloudDrive/types').DriveTransport
  mkdir?(key: string, signal?: AbortSignal): Promise<void>
  write?(key: string, input: Readable, size: number, progress: (bytes: number) => void, signal?: AbortSignal): Promise<void>
  /** Retain exactly offset bytes of an existing regular staging file, then write the remainder.
   * Progress counts bytes from this request; size is the complete final size. */
  resumeWrite?(key: string, input: Readable, size: number, offset: number, progress: (bytes: number) => void, signal?: AbortSignal): Promise<void>
  move?(from: string, to: string, signal?: AbortSignal): Promise<void>
  remove?(key: string, signal?: AbortSignal): Promise<void>
}

export const nasFileVersion = (file: {size: number; modifiedAt?: number; etag?: string}) => `${file.size}:${file.modifiedAt || 0}${file.etag ? `:${file.etag}` : ''}`
export const driveFileVersion = (file: {size?: number; modifiedTime?: string}) => `${file.size || 0}:${file.modifiedTime || ''}`
