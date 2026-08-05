import fs from 'fs'
import path from 'path'
import {
  PATHOLOGICAL_SAMPLE_COUNT,
  probeBufferForPathologicalLayout,
} from './mp4BoxProbe'

export {PATHOLOGICAL_SAMPLE_COUNT, probeBufferForPathologicalLayout} from './mp4BoxProbe'

const MAX_SCAN_BYTES = 8 * 1024 * 1024

/**
 * Chromium can start some H.264/AAC MP4s but freeze on seek when the file uses
 * 1-sample chunks + huge sample tables (classic old FlixEngine / naive muxers).
 */
function needsBrowserRemuxForMp4(filePath: string): boolean {
  const extension = path.extname(filePath || '').toLowerCase()
  if (extension !== '.mp4' && extension !== '.m4v') return false

  try {
    const fd = fs.openSync(filePath, 'r')
    try {
      const stat = fs.fstatSync(fd)
      const bytesToRead = Math.min(stat.size, MAX_SCAN_BYTES)
      const buffer = Buffer.allocUnsafe(bytesToRead)
      const read = fs.readSync(fd, buffer, 0, bytesToRead, 0)
      return probeBufferForPathologicalLayout(buffer.subarray(0, read))
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return false
  }
}

export {
  needsBrowserRemuxForMp4,
}
