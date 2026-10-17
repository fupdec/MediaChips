import {Readable} from 'stream'
import {createHash, randomUUID} from 'crypto'
import type {
  DriveFileEntry,
  DriveFileMeta,
  DriveHttpResponse,
  DriveListResult,
  DriveTransport,
} from './types'

/** ~64 KiB of zeros — enough to exercise Range headers without a real media file. */
const MOCK_FILE_SIZE = 64 * 1024
const MOCK_MIME = 'video/mp4'

const MOCK_FILES: DriveFileEntry[] = [
  {
    id: 'mock-folder-clips',
    name: 'Clips',
    mimeType: 'application/vnd.google-apps.folder',
    isFolder: true,
  },
  {
    id: 'mock-video-sample',
    name: 'sample-spike.mp4',
    mimeType: MOCK_MIME,
    size: MOCK_FILE_SIZE,
    modifiedTime: '2026-09-16T12:00:00.000Z',
    isFolder: false,
  },
]

function parseRange(rangeHeader: string | undefined, size: number): {start: number; end: number} | null {
  if (!rangeHeader) return null
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim())
  if (!match) return null
  const start = match[1] ? parseInt(match[1], 10) : 0
  const end = match[2] ? parseInt(match[2], 10) : size - 1
  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) return null
  return {start, end: Math.min(end, size - 1)}
}

/**
 * In-process Drive transport for CI and local runs without Google credentials.
 * Mirrors list + Range download contracts used by the live client.
 */
function createMockDriveTransport(): DriveTransport {
  const files = new Map<string, DriveFileMeta>(MOCK_FILES.map(file => [file.id, {...file, size: file.size || 0,
    parents: file.id === 'mock-video-sample' ? ['root', 'mock-folder-clips'] : ['root'],
    capabilities: {canEdit: true, canDelete: true, canAddChildren: file.isFolder},
    md5Checksum: file.isFolder ? undefined : createHash('md5').update(Buffer.alloc(file.size || 0)).digest('hex')}]))
  files.set('root', {id: 'root', name: 'My Drive', size: 0, mimeType: 'application/vnd.google-apps.folder', parents: [], capabilities: {canAddChildren: true, canEdit: true, canDelete: false}})
  const payloads = new Map<string, Buffer>()
  const transport: DriveTransport = {
    async listFolder(folderId: string): Promise<DriveListResult> {
      return {
        folderId: folderId || 'root',
        files: [...files.values()].filter(file => file.parents?.includes(folderId || 'root')).map(file => ({...file, isFolder: file.mimeType === 'application/vnd.google-apps.folder'})),
        mock: true,
      }
    },

    async getFileMeta(fileId: string): Promise<DriveFileMeta> {
      const found = files.get(fileId)
      if (!found) {
        throw Object.assign(new Error(`Mock file not found: ${fileId}`), {status: 404})
      }
      return {...found}
    },

    async downloadFile(fileId: string, rangeHeader?: string): Promise<DriveHttpResponse> {
      const meta = await this.getFileMeta(fileId)
      const size = meta.size
      const range = parseRange(rangeHeader, size)
      const payload = payloads.get(fileId) || Buffer.alloc(size, 0)

      if (range) {
        const chunk = payload.subarray(range.start, range.end + 1)
        return {
          status: 206,
          headers: {
            'content-type': meta.mimeType,
            'content-length': String(chunk.length),
            'content-range': `bytes ${range.start}-${range.end}/${size}`,
            'accept-ranges': 'bytes',
          },
          body: chunk,
        }
      }

      return {
        status: 200,
        headers: {
          'content-type': meta.mimeType,
          'content-length': String(size),
          'accept-ranges': 'bytes',
        },
        body: Readable.from(payload),
      }
    },
  }
  transport.originals = {
    async generateId() { return 'mock-' + randomUUID() },
    async create(id, parent, name, input, _size, _signal, contentType = 'application/octet-stream') {
      if (files.has(id)) throw Object.assign(new Error('Already exists'), {status: 409})
      const chunks: Buffer[] = []
      if (input) for await (const chunk of input) chunks.push(Buffer.from(chunk))
      const payload = Buffer.concat(chunks)
      const file: DriveFileMeta = {id, name, mimeType: input ? contentType : 'application/vnd.google-apps.folder',
        size: payload.length, modifiedTime: new Date().toISOString(), parents: [parent], md5Checksum: input ? createHash('md5').update(payload).digest('hex') : undefined,
        capabilities: {canEdit: true, canDelete: true, canAddChildren: !input}}
      files.set(id, file); payloads.set(id, payload)
      return {...file}
    },
    async update(id, name, parent) {
      const file = await transport.getFileMeta(id)
      const updated = {...file, name, parents: parent ? [parent] : file.parents, modifiedTime: new Date().toISOString()}
      files.set(id, updated); return {...updated}
    },
    async remove(id) { await transport.getFileMeta(id); files.delete(id); payloads.delete(id) },
  }
  return transport
}

export {createMockDriveTransport, MOCK_FILE_SIZE, MOCK_FILES, parseRange}
