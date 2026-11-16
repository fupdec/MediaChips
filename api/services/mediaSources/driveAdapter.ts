import {cloudMediaMetadata} from '../cloudAccounts/mediaMetadata'
import {Readable} from 'stream'
import {DriveFileIdSchema, driveMediaContentType} from '../../../shared/cloudDrive'
import {READ_SOURCE_CAPABILITIES} from '../../../shared/mediaSources'
import type {DriveTransport, DriveFileEntry} from '../cloudDrive/types'
import {driveFileVersion, type SourceWriteAdapter, type SourceObject} from './adapter'
import {sourceOperation, sourceStream} from './cancellation'

const object = (file: Omit<DriveFileEntry, 'isFolder'> & {isFolder?: boolean}): SourceObject => ({
  resourceKey: file.id, name: file.name, size: file.size || 0,
  isDirectory: file.isFolder ?? file.mimeType === 'application/vnd.google-apps.folder',
  modifiedAt: file.modifiedTime ? Date.parse(file.modifiedTime) : undefined,
  mediaMetadata: cloudMediaMetadata('gdrive', file),
  contentType: driveMediaContentType(file.name, file.mimeType), version: driveFileVersion(file),
})

export function createDriveSourceAdapter(transport: DriveTransport, writable = false): SourceWriteAdapter {
  return {
    drive: transport,
    provider: 'gdrive', capabilities: {...READ_SOURCE_CAPABILITIES, move: writable, delete: writable},
    async list(key, pageToken, signal) {
      const page = await sourceOperation(() => transport.listFolder(DriveFileIdSchema.parse(key || 'root'), pageToken, signal), signal)
      return {entries: page.files.map(object), nextPageToken: page.nextPageToken}
    },
    async stat(key, signal) {
      return object(await sourceOperation(() => transport.getFileMeta(DriveFileIdSchema.parse(key), signal), signal))
    },
    async read(key, rangeHeader, signal) {
      const result = await sourceOperation(() => transport.downloadFile(DriveFileIdSchema.parse(key), rangeHeader, signal), signal)
      signal?.throwIfAborted()
      if (Buffer.isBuffer(result.body)) return {...result, body: result.body}
      const body = result.body instanceof Readable ? result.body : Readable.from(result.body)
      return {...result, body: sourceStream(body, signal)}
    },
    thumbnail: transport.thumbnail ? (key, signal) => transport.thumbnail!(DriveFileIdSchema.parse(key), signal) : undefined,
    close() { /* Drive requests are independent; their AbortSignal owns cancellation. */ },
  }
}
