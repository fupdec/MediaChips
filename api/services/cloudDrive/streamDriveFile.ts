import type {Request, Response} from 'express'
import {Readable} from 'stream'
import {isClientAbortError} from '../../../app/server/fileResolver'
import type {DriveTransport} from './types'

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
    const status = (err as {status?: number})?.status || 404
    res.status(status).json({
      message: err instanceof Error ? err.message : 'Drive file not found',
    })
    return
  }

  if (meta.mimeType?.startsWith('application/vnd.google-apps.')) {
    res.status(415).json({
      message: 'Google Docs/Sheets/etc. are not streamable as binary media; export is out of spike scope',
      mimeType: meta.mimeType,
    })
    return
  }

  const contentType = meta.mimeType || fallbackContentType
  const downloaded = await transport.downloadFile(fileId, rangeValue)

  const upstreamType = headerValue(downloaded.headers, 'content-type') || contentType
  const contentLength = headerValue(downloaded.headers, 'content-length')
  const contentRange = headerValue(downloaded.headers, 'content-range')

  const head: Record<string, string | number> = {
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
  stream.on('error', (streamErr: NodeJS.ErrnoException) => {
    if (!isClientAbortError(streamErr)) {
      console.error('Drive stream error:', streamErr)
    }
    stream.destroy()
    if (!res.headersSent) {
      res.status(500).end()
    } else {
      res.destroy()
    }
  })
  req.on('close', () => stream.destroy())
  stream.pipe(res)
}

export {streamDriveFile}
