import type {Request, Response} from 'express'
import {Readable} from 'stream'
import {pipeline} from 'stream/promises'
import {isClientAbortError} from '../../../app/server/fileResolver'
import type {DriveTransport} from './types'
import {driveMediaContentType} from '../../../shared/cloudDrive'

function headerValue(headers: Record<string, string | undefined>, name: string): string | undefined {
  return headers[name.toLowerCase()] || headers[name]
}

/**
 * Server-side Range proxy for a Drive file.
 * Mirrors streamVideoFile: HTML5 <video> talks to MediaChips API only;
 * tokens and Drive URLs never leave the API/Electron process.
 */
async function streamDriveFile(
  req: Request,
  res: Response,
  transport: DriveTransport,
  fileId: string,
  fallbackContentType = 'application/octet-stream',
): Promise<void> {
  const rangeHeader = req.headers.range
  const rangeValue = Array.isArray(rangeHeader) ? rangeHeader[0] : rangeHeader

  let meta
  try {
    meta = await transport.getFileMeta(fileId)
  } catch (err: unknown) {
    const status = (err as {status?: number; response?: {status?: number}})?.status || (err as {response?: {status?: number}})?.response?.status || 404
    res.status(status === 401 ? 409 : status).json({
      message: err instanceof Error ? err.message : 'Drive file not found',
    })
    return
  }

  if (meta.mimeType?.startsWith('application/vnd.google-apps.')) {
    res.status(415).json({
      message: 'Google Docs/Sheets/etc. are not streamable as binary media; only binary media can be streamed',
      mimeType: meta.mimeType,
    })
    return
  }

  const contentType = driveMediaContentType(meta.name, meta.mimeType || fallbackContentType)
  if (!/^(video\/|audio\/|image\/(jpeg|png|gif|webp|avif|bmp)$)/.test(contentType)) {
    res.status(415).json({message: 'Only video, audio and supported raster images can be streamed.'})
    return
  }
  const downloaded = await transport.downloadFile(fileId, rangeValue)

  const upstreamType = contentType
  const contentLength = headerValue(downloaded.headers, 'content-length')
  const contentRange = headerValue(downloaded.headers, 'content-range')

  const head: Record<string, string | number> = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Type': upstreamType,
    'Accept-Ranges': 'bytes',
  }
  if (contentLength) head['Content-Length'] = contentLength
  if (contentRange) head['Content-Range'] = contentRange

  const status = downloaded.status === 206 || contentRange ? 206 : 200
  res.writeHead(status, head)

  const body = downloaded.body
  if (Buffer.isBuffer(body)) {
    res.end(body)
    return
  }

  const stream = body as Readable
  const abort = () => stream.destroy()
  res.once('close', abort)
  try { await pipeline(stream, res) }
  catch (err) {
    if (!isClientAbortError(err as NodeJS.ErrnoException) && !res.destroyed) throw err
  } finally { res.removeListener('close', abort) }

}

export {streamDriveFile}
