import path from 'path'
import {READ_SOURCE_CAPABILITIES} from '../../../shared/mediaSources'
import {mediaFileContentType} from '../../../shared/mediaFormats'
import {normalizeNasRelativePath, type NasTransport, type NasFile} from '../nas/transport'
import {NasError} from '../nas/errors'
import {nasFileVersion, type SourceReadAdapter, type SourceObject} from './adapter'
import {sourceOperation, sourceStream} from './cancellation'
import {parseSourceRange} from './range'

const object = (resourceKey: string, file: NasFile): SourceObject => ({
  ...file, resourceKey, name: path.posix.basename(resourceKey), version: nasFileVersion(file),
  contentType: mediaFileContentType(resourceKey) || 'application/octet-stream',
})

/** Owns one NAS session. Only reads already implemented by the transport are advertised. */
export function createNasSourceAdapter(transport: NasTransport): SourceReadAdapter {
  const run = <T>(action: () => Promise<T>, signal?: AbortSignal) => sourceOperation(action, signal, () => transport.close())
  return {
    provider: 'nas', capabilities: READ_SOURCE_CAPABILITIES,
    async list(key, pageToken, signal) {
      const offset = pageToken === undefined ? 0 : Number(pageToken)
      if (!Number.isSafeInteger(offset) || offset < 0 || (pageToken !== undefined && String(offset) !== pageToken)) {
        throw new NasError('invalid_page', 'Invalid directory continuation.', 400)
      }
      const entries = (await run(() => transport.list(normalizeNasRelativePath(key)), signal))
        .sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name))
      const end = offset + 5000
      return {entries: entries.slice(offset, end).map(entry => object(entry.path, entry)),
        nextPageToken: entries.length > end ? String(end) : undefined}
    },
    async stat(key, signal) {
      key = normalizeNasRelativePath(key)
      return object(key, await run(() => transport.stat(key), signal))
    },
    async read(key, rangeHeader, signal) {
      key = normalizeNasRelativePath(key)
      const file = await this.stat(key, signal)
      if (file.isDirectory) throw new NasError('invalid_file', 'Select a file.', 400)
      const range = parseSourceRange(rangeHeader, file.size)
      if (!range) throw new NasError('invalid_range', 'Invalid byte range.', 416)
      const body = sourceStream(await run(() => transport.read(key, range.start, range.end), signal), signal)
      return {status: range.partial ? 206 : 200, body, headers: {
        'content-type': file.contentType, 'content-length': String(range.end - range.start + 1),
        'accept-ranges': 'bytes',
        'content-range': range.partial ? `bytes ${range.start}-${range.end}/${file.size}` : undefined,
      }}
    },
    close() { transport.close() },
  }
}
