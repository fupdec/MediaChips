import fs from 'fs'
import path from 'path'

/** Sample tables this large with 1-sample chunks routinely hang Chromium seeks. */
const PATHOLOGICAL_SAMPLE_COUNT = 10_000
const MAX_SCAN_BYTES = 8 * 1024 * 1024

interface BoxInfo {
  offset: number
  size: number
  headerSize: number
  type: string
}

function readBoxes(buffer: Buffer, start: number, end: number): BoxInfo[] {
  const boxes: BoxInfo[] = []
  let offset = start

  while (offset + 8 <= end) {
    let size = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    let headerSize = 8

    if (size === 1) {
      if (offset + 16 > end) break
      const large = buffer.readBigUInt64BE(offset + 8)
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) break
      size = Number(large)
      headerSize = 16
    } else if (size === 0) {
      size = end - offset
    }

    if (size < headerSize) break

    boxes.push({offset, size, headerSize, type})
    if (offset + size > end) break
    offset += size
  }

  return boxes
}

function findBox(boxes: BoxInfo[], type: string): BoxInfo | undefined {
  return boxes.find((box) => box.type === type)
}

function readStscPathological(buffer: Buffer, box: BoxInfo): boolean {
  const bodyStart = box.offset + box.headerSize
  if (bodyStart + 8 > buffer.length) return false

  // FullBox: version(1) + flags(3) + entry_count(4)
  const entryCount = buffer.readUInt32BE(bodyStart + 4)
  if (!entryCount) return false

  const entriesStart = bodyStart + 8
  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = entriesStart + index * 12
    if (entryOffset + 12 > buffer.length) break
    const samplesPerChunk = buffer.readUInt32BE(entryOffset + 4)
    if (samplesPerChunk === 1) return true
  }

  return false
}

function readStszSampleCount(buffer: Buffer, box: BoxInfo): number {
  const bodyStart = box.offset + box.headerSize
  if (bodyStart + 12 > buffer.length) return 0
  // FullBox + sample_size(4) + sample_count(4)
  return buffer.readUInt32BE(bodyStart + 8)
}

function readSttsEntryCount(buffer: Buffer, box: BoxInfo): number {
  const bodyStart = box.offset + box.headerSize
  if (bodyStart + 8 > buffer.length) return 0
  return buffer.readUInt32BE(bodyStart + 4)
}

function isVideoTrack(buffer: Buffer, trak: BoxInfo): boolean {
  const trakBoxes = readBoxes(buffer, trak.offset + trak.headerSize, Math.min(trak.offset + trak.size, buffer.length))
  const mdia = findBox(trakBoxes, 'mdia')
  if (!mdia) return false

  const mdiaBoxes = readBoxes(buffer, mdia.offset + mdia.headerSize, Math.min(mdia.offset + mdia.size, buffer.length))
  const hdlr = findBox(mdiaBoxes, 'hdlr')
  if (!hdlr || hdlr.offset + hdlr.headerSize + 12 > buffer.length) return false

  const handler = buffer.toString('ascii', hdlr.offset + hdlr.headerSize + 8, hdlr.offset + hdlr.headerSize + 12)
  return handler === 'vide'
}

function getVideoSampleTable(buffer: Buffer, moov: BoxInfo) {
  const moovEnd = Math.min(moov.offset + moov.size, buffer.length)
  const moovBoxes = readBoxes(buffer, moov.offset + moov.headerSize, moovEnd)

  for (const trak of moovBoxes.filter((box) => box.type === 'trak')) {
    if (!isVideoTrack(buffer, trak)) continue

    const trakBoxes = readBoxes(buffer, trak.offset + trak.headerSize, Math.min(trak.offset + trak.size, buffer.length))
    const mdia = findBox(trakBoxes, 'mdia')
    if (!mdia) continue

    const mdiaBoxes = readBoxes(buffer, mdia.offset + mdia.headerSize, Math.min(mdia.offset + mdia.size, buffer.length))
    const minf = findBox(mdiaBoxes, 'minf')
    if (!minf) continue

    const minfBoxes = readBoxes(buffer, minf.offset + minf.headerSize, Math.min(minf.offset + minf.size, buffer.length))
    const stbl = findBox(minfBoxes, 'stbl')
    if (!stbl) continue

    const stblBoxes = readBoxes(buffer, stbl.offset + stbl.headerSize, Math.min(stbl.offset + stbl.size, buffer.length))
    return {
      stsc: findBox(stblBoxes, 'stsc'),
      stsz: findBox(stblBoxes, 'stsz'),
      stts: findBox(stblBoxes, 'stts'),
    }
  }

  return null
}

function probeBufferForPathologicalLayout(buffer: Buffer): boolean {
  const topBoxes = readBoxes(buffer, 0, buffer.length)
  const moov = findBox(topBoxes, 'moov')
  if (!moov) {
    // moov at end / incomplete scan — avoid false positives
    return false
  }

  // Incomplete moov in the buffer: can't decide safely.
  if (moov.offset + moov.size > buffer.length) {
    return moov.size >= PATHOLOGICAL_SAMPLE_COUNT * 8
  }

  const table = getVideoSampleTable(buffer, moov)
  if (!table) return false

  const sampleCount = table.stsz ? readStszSampleCount(buffer, table.stsz) : 0
  const sttsEntries = table.stts ? readSttsEntryCount(buffer, table.stts) : 0
  const oneSampleChunks = table.stsc ? readStscPathological(buffer, table.stsc) : false

  if (sampleCount >= PATHOLOGICAL_SAMPLE_COUNT && oneSampleChunks) {
    return true
  }

  // Per-frame timestamps (33/34 deltas) also explode demuxer seek cost.
  if (sttsEntries >= PATHOLOGICAL_SAMPLE_COUNT && oneSampleChunks) {
    return true
  }

  return false
}

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
  PATHOLOGICAL_SAMPLE_COUNT,
  needsBrowserRemuxForMp4,
  probeBufferForPathologicalLayout,
}
