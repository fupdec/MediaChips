import {Readable} from 'stream'
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
  return {
    async listFolder(folderId: string): Promise<DriveListResult> {
      return {
        folderId: folderId || 'root',
        files: MOCK_FILES,
        mock: true,
      }
    },

    async getFileMeta(fileId: string): Promise<DriveFileMeta> {
      const found = MOCK_FILES.find((f) => f.id === fileId && !f.isFolder)
      if (!found) {
        throw Object.assign(new Error(`Mock file not found: ${fileId}`), {status: 404})
      }
      return {
        id: found.id,
        name: found.name,
        mimeType: found.mimeType,
        size: found.size ?? MOCK_FILE_SIZE,
        modifiedTime: found.modifiedTime,
      }
    },

    async downloadFile(fileId: string, rangeHeader?: string): Promise<DriveHttpResponse> {
      const meta = await this.getFileMeta(fileId)
      const size = meta.size
      const range = parseRange(rangeHeader, size)
      const payload = Buffer.alloc(size, 0)

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
}

export {createMockDriveTransport, MOCK_FILE_SIZE, MOCK_FILES, parseRange}
