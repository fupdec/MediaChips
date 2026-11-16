import type {Request, Response} from 'express'
import fs from 'fs'
import {isClientAbortError} from '../../../app/server/fileResolver'
import {parseSourceRange} from '../mediaSources/range'

/** Stream bytes with backpressure; a closed response releases the file immediately. */
function streamVideoFile(
  req: Request,
  res: Response,
  filePath: string,
  contentType = 'video/mp4',
): void {
  const fileSize = fs.statSync(filePath).size
  const header = req.headers.range
  const range = parseSourceRange(Array.isArray(header) ? header[0] : header, fileSize)
  res.setHeader('Accept-Ranges', 'bytes')
  res.setHeader('Cache-Control', 'private, no-store')
  if (!range) {
    res.status(416).setHeader('Content-Range', `bytes */${fileSize}`)
    res.end()
    return
  }
  res.status(range.partial ? 206 : 200)
  res.setHeader('Content-Type', contentType)
  res.setHeader('Content-Length', range.end - range.start + 1)
  if (range.partial) res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${fileSize}`)
  if (req.method === 'HEAD' || fileSize === 0) { res.end(); return }

  const file = fs.createReadStream(filePath, {start: range.start, end: range.end})
  const cancel = () => file.destroy()
  res.once('close', cancel)
  file.once('close', () => res.removeListener('close', cancel))
  file.once('error', (error: NodeJS.ErrnoException) => {
    if (!isClientAbortError(error)) console.error('Video stream error:', error)
    // End a failed transfer so the player can retry, rather than waiting forever.
    res.destroy(error)
  })
  file.pipe(res)
}

export {streamVideoFile}
