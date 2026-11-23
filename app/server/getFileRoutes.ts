import type { Express } from 'express'
import type { ApiDb } from '../../api/types/db'
import type { ApiRequest, ApiResponse } from '../../api/types/http'
import { apiErrorMessage } from '../../api/types/errors'
import type { ResolveFilePathFn } from '../types/builtinRoutes'
import path from 'path'
import fs from 'fs'
import { isAllowedOrigin } from './constants'
import { isClientAbortError, safeJsonError } from './fileResolver'
import { checkFilesExist } from '../../api/services/checkFilesExist'
import { resolveVideoThumbFilePath } from '../../api/services/videoPreviewThumb'
import { createRequestAbortSignal } from '../../api/services/requestAbortSignal'
import { isVirtualZipPath, readZipEntryBuffer } from '../../api/services/zipGallery'
import { parseVirtualZipPath } from '../../api/services/zipVirtualPath'
import { evaluateFileServe } from '../../api/services/fileServePolicy'
import { resizeImageToMaxEdge } from '../../api/services/imageMedia'

const FILE_MIME_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.heic': 'image/heic',
  '.avif': 'image/avif',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.ogg': 'audio/ogg',
  '.ogv': 'video/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.opus': 'audio/ogg',
} as const

const VIEWER_RESIZE_EXTS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.avif', '.heic', '.heif', '.gif',
])

const MISSING_FILE_LOG_INTERVAL_MS = 60_000
/** A library with many missing thumbnails would otherwise print one line per file in a burst. */
const MISSING_FILE_LOG_BURST_LIMIT = 5
const missingFileLoggedAt = new Map<string, number>()
let missingBurstStart = 0
let missingBurstLogged = 0
let missingBurstSuppressed = 0

/**
 * One line per missing file per minute, and at most a few distinct files per minute overall;
 * the rest are counted and reported in one summary line when the next minute starts.
 * Returns true when the file's own line was printed.
 */
export function logMissingFileOnce(filePath: string, now = Date.now()): boolean {
  const last = missingFileLoggedAt.get(filePath)
  if (last != null && now - last < MISSING_FILE_LOG_INTERVAL_MS) return false
  if (missingFileLoggedAt.size > 2000) missingFileLoggedAt.clear()
  missingFileLoggedAt.set(filePath, now)

  if (now - missingBurstStart >= MISSING_FILE_LOG_INTERVAL_MS) {
    if (missingBurstSuppressed > 0) {
      console.error(`File not found: ${missingBurstSuppressed} more missing files in the last minute (not listed)`)
    }
    missingBurstStart = now
    missingBurstLogged = 0
    missingBurstSuppressed = 0
  }
  if (missingBurstLogged >= MISSING_FILE_LOG_BURST_LIMIT) {
    missingBurstSuppressed += 1
    return false
  }
  missingBurstLogged += 1
  console.error('File not found:', filePath)
  return true
}

function getFileRequestPath(req: ApiRequest): string | null {
  const bodyPath = req.body?.url
  if (typeof bodyPath === 'string' && bodyPath) return bodyPath

  const queryPath = req.query?.url
  if (typeof queryPath === 'string' && queryPath) return queryPath
  if (Array.isArray(queryPath) && typeof queryPath[0] === 'string' && queryPath[0]) {
    return queryPath[0]
  }

  return null
}

function applyCorsHeaders(req: ApiRequest, res: ApiResponse) {
  const requestOrigin = req.headers.origin
  if (typeof requestOrigin === 'string' && isAllowedOrigin(requestOrigin)) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin)
    res.setHeader('Vary', 'Origin')
    return
  }

  if (!requestOrigin) {
    res.setHeader('Access-Control-Allow-Origin', '*')
  }
}

function parseMaxEdge(req: ApiRequest): number | null {
  const raw = req.query?.maxEdge
  const value = Number(Array.isArray(raw) ? raw[0] : raw)
  if (!Number.isFinite(value)) return null
  const edge = Math.round(value)
  // 64–511: filmstrip / compact previews from library thumbs; 512+: viewer.
  if (edge < 64 || edge > 8192) return null
  return edge
}

function rejectBlockedFile(res: ApiResponse, filePath: string, trustedRoots: string[]): boolean {
  const decision = evaluateFileServe(filePath, {trustedRoots})
  if (decision.allowed) return false
  console.warn(`[get-file] refused ${decision.reason}: ${filePath}`)
  res.status(403).json({error: 'File type is not served', reason: decision.reason})
  return true
}

export function registerGetFileRoutes({
  app,
  db,
  resolveFilePath,
  trustedRoots = [],
}: {
  app: Express
  db: ApiDb
  resolveFilePath: ResolveFilePathFn
  /** App-managed folders (thumbs, meta images) exempt from hidden/extensionless checks. */
  trustedRoots?: string[]
}) {
  async function handleGetFile(req: ApiRequest, res: ApiResponse, {headOnly = false} = {}) {
    applyCorsHeaders(req, res)

    const originalFilePath = getFileRequestPath(req)

    if (!originalFilePath) {
      return res.status(400).json({error: 'No file path provided'})
    }

    try {
      if (isVirtualZipPath(originalFilePath)) {
        const zipPath = parseVirtualZipPath(originalFilePath)?.zipPath
        if (zipPath && rejectBlockedFile(res, zipPath, trustedRoots)) return
        const entry = await readZipEntryBuffer(originalFilePath)
        if (!entry) {
          console.error('ZIP entry not found:', originalFilePath)
          return res.status(404).json({
            error: 'File not found',
            resolved: false,
          })
        }

        const ext = path.extname(entry.entryName).toLowerCase()
        const contentType = FILE_MIME_TYPES[ext as keyof typeof FILE_MIME_TYPES] || 'application/octet-stream'
        const etag = `W/"zip-${entry.filesize}-${Math.trunc(entry.zipMtimeMs)}-${entry.entryName}"`

        const maxEdge = parseMaxEdge(req)
        let payload = entry.buffer
        let payloadType = contentType
        let payloadEtag = etag

        if (maxEdge && VIEWER_RESIZE_EXTS.has(ext) && !headOnly) {
          try {
            const resized = await resizeImageToMaxEdge(entry.buffer, maxEdge)
            if (resized) {
              payload = resized.buffer
              payloadType = 'image/jpeg'
              payloadEtag = `W/"zip-v${maxEdge}-${entry.filesize}-${Math.trunc(entry.zipMtimeMs)}-${entry.entryName}"`
            }
          } catch (error) {
            console.error('ZIP viewer resize failed, serving original entry:', error)
          }
        }

        res.setHeader('Content-Type', payloadType)
        res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate')
        res.setHeader('ETag', payloadEtag)
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition')
        res.setHeader('Content-Length', payload.length)

        const ifNoneMatch = req.headers['if-none-match']
        if (typeof ifNoneMatch === 'string') {
          const tags = ifNoneMatch.split(',').map((tag) => tag.trim())
          if (tags.includes(payloadEtag) || tags.includes('*')) {
            return res.status(304).end()
          }
        }

        if (headOnly) {
          return res.status(200).end()
        }

        return res.status(200).end(payload)
      }

      const resolvedPath = await resolveVideoThumbFilePath(
        originalFilePath,
        db,
        resolveFilePath,
        {signal: createRequestAbortSignal(req, res)},
      )

      if (!resolvedPath) {
        logMissingFileOnce(originalFilePath)
        return res.status(404).json({
          error: 'File not found',
          resolved: false,
        })
      }

      if (rejectBlockedFile(res, resolvedPath, trustedRoots)) return

      const ext = path.extname(resolvedPath).toLowerCase()
      const contentType = FILE_MIME_TYPES[ext as keyof typeof FILE_MIME_TYPES] || 'application/octet-stream'
      const stats = fs.statSync(resolvedPath)
      const maxEdge = parseMaxEdge(req)
      const etag = maxEdge && VIEWER_RESIZE_EXTS.has(ext)
        ? `W/"v${maxEdge}-${stats.size}-${Math.trunc(stats.mtimeMs)}"`
        : `W/"${stats.size}-${Math.trunc(stats.mtimeMs)}"`

      // Media thumbs/grids can be overwritten by scraped posters (TPDB etc.), so
      // they are always revalidated via ETag (unchanged -> cheap 304). Library
      // thumbs add stale-while-revalidate: a card that scrolls back into view
      // paints the cached thumb at once instead of waiting on a round trip
      // (blank flashes), and a changed poster shows up on the next view.
      const isLibraryThumb = /[\\/](thumbs|grids)[\\/]/.test(resolvedPath)
      const cacheControl = isLibraryThumb
        ? 'public, max-age=0, stale-while-revalidate=604800'
        : 'public, max-age=0, must-revalidate'

      const ifNoneMatch = req.headers['if-none-match']
      if (typeof ifNoneMatch === 'string') {
        const tags = ifNoneMatch.split(',').map((tag) => tag.trim())
        if (tags.includes(etag) || tags.includes('*')) {
          res.setHeader('ETag', etag)
          res.setHeader('Cache-Control', cacheControl)
          return res.status(304).end()
        }
      } else {
        const ifModifiedSince = req.headers['if-modified-since']
        if (typeof ifModifiedSince === 'string' && !(maxEdge && VIEWER_RESIZE_EXTS.has(ext))) {
          const since = Date.parse(ifModifiedSince)
          if (!Number.isNaN(since) && Math.trunc(stats.mtimeMs) <= since) {
            res.setHeader('ETag', etag)
            res.setHeader('Cache-Control', cacheControl)
            res.setHeader('Last-Modified', stats.mtime.toUTCString())
            return res.status(304).end()
          }
        }
      }

      if (headOnly) {
        res.setHeader('Content-Type', contentType)
        res.setHeader('Cache-Control', cacheControl)
        res.setHeader('Last-Modified', stats.mtime.toUTCString())
        res.setHeader('ETag', etag)
        return res.status(200).end()
      }

      if (maxEdge && VIEWER_RESIZE_EXTS.has(ext)) {
        try {
          const resized = await resizeImageToMaxEdge(resolvedPath, maxEdge)
          if (resized) {
            res.setHeader('Content-Type', 'image/jpeg')
            res.setHeader('Cache-Control', cacheControl)
            res.setHeader('Last-Modified', stats.mtime.toUTCString())
            res.setHeader('ETag', etag)
            res.setHeader('Content-Length', resized.buffer.length)
            res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition')
            return res.status(200).end(resized.buffer)
          }
        } catch (error) {
          console.error('Viewer resize failed, serving original file:', error)
        }
      }

      res.setHeader('Content-Type', contentType)
      res.setHeader('Cache-Control', cacheControl)
      res.setHeader('Last-Modified', stats.mtime.toUTCString())
      res.setHeader('ETag', etag)
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition')

      // Keep the explicit validators above; avoid sendFile replacing them.
      res.sendFile(resolvedPath, {etag: false, lastModified: false}, (err: unknown) => {
        if (!err) return

        if (isClientAbortError(err) || req.aborted || res.writableEnded) {
          return
        }

        console.error('Error sending file:', err)

        if (res.headersSent) return

        try {
          const fileStream = fs.createReadStream(resolvedPath)

          fileStream.on('error', (streamErr: Error) => {
            if (!isClientAbortError(streamErr)) {
              console.error('File stream error:', streamErr)
            }
            safeJsonError(res, req, 500, {
              error: 'File stream error',
              details: streamErr.message,
            })
          })

          req.on('close', () => {
            fileStream.destroy()
          })

          res.setHeader('Content-Length', stats.size)
          fileStream.pipe(res)
        } catch (streamErr: unknown) {
          safeJsonError(res, req, 500, {
            error: 'File stream error',
            details: streamErr instanceof Error ? streamErr.message : String(streamErr),
          })
        }
      })
    } catch (err: unknown) {
      console.error('Error processing file:', err)
      safeJsonError(res, req, 500, {error: 'Server error', details: err instanceof Error ? apiErrorMessage(err) : String(err)})
    }
  }

  app.get('/api/get-file', (req: ApiRequest, res: ApiResponse) => {
    void handleGetFile(req, res)
  })

  app.head('/api/get-file', (req: ApiRequest, res: ApiResponse) => {
    void handleGetFile(req, res, {headOnly: true})
  })

  app.post('/api/get-file', (req: ApiRequest, res: ApiResponse) => {
    void handleGetFile(req, res)
  })

  app.post('/api/check-file', (req: ApiRequest, res: ApiResponse) => {
    const filePath = req.body.url

    if (!filePath) {
      return res.json({exists: false, error: 'No path provided'})
    }

    const resolvedPath = resolveFilePath(filePath)
    res.json({
      exists: !!resolvedPath,
    })
  })

  app.post('/api/check-files', async (req: ApiRequest, res: ApiResponse) => {
    const paths = Array.isArray(req.body.paths) ? req.body.paths : []

    if (!paths.length) {
      return res.json({results: {}})
    }

    try {
      const results = await checkFilesExist(paths)
      res.json({results})
    } catch (err: unknown) {
      safeJsonError(res, req, 500, {
        error: 'Batch file check failed',
        details: err instanceof Error ? err.message : String(err),
      })
    }
  })
}
